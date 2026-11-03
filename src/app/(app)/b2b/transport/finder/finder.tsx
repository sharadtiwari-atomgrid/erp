"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { formatDmy } from "@/lib/ops/dates";
import {
  CARGO_TYPES, TIERS, amount, buildTrips, cargoCaution, makePinResolver, makeTransporterResolver, onTimeTone, overallRecord,
  phoneDigits, rankHistory, rankLeads, resolvePlace, zoneOf, type HistoryCandidate, type RankedLead,
} from "@/lib/ops/transport";
import type { PlaceContact, PlainTransportJob, TransporterContact } from "../data";
import { Pill, inr, inr2, numCls, tdCls, thCls, toneText } from "../ui";
import { routeDistance } from "./actions";

const kmText = (n: number | null | undefined) => (n ? `${Math.round(n).toLocaleString("en-IN")} km` : "—");
const daysText = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n % 1 ? n.toFixed(1) : n} day${n === 1 ? "" : "s"}`);
const kgText = (n: number) => n.toLocaleString("en-IN");

type Enquiry = (name: string) => string;

function Actions({
  name, phone, email, source, enquiry, routeLabel, copied, onCopy,
}: {
  name: string;
  phone?: string | null;
  email?: string | null;
  source?: string;
  enquiry: Enquiry;
  routeLabel: string;
  copied: boolean;
  onCopy: (name: string) => void;
}) {
  const p = phoneDigits(phone);
  const msg = encodeURIComponent(enquiry(name));
  const act = buttonClass("secondary", "sm", "rounded-full");
  return (
    <div className="flex flex-wrap gap-1.5">
      {p && <a className={act} href={`tel:+${p}`}>📞 Call</a>}
      {p && p.length === 12 && (
        <a className={act} href={`https://wa.me/${p}?text=${msg}`} target="_blank" rel="noreferrer">
          💬 WhatsApp enquiry
        </a>
      )}
      {email && (
        <a className={act} href={`mailto:${email}?subject=${encodeURIComponent(`Rate enquiry ${routeLabel}`)}&body=${msg}`}>
          ✉️ Email
        </a>
      )}
      <button type="button" className={act} onClick={() => onCopy(name)}>
        {copied ? "✓ Copied" : "📋 Copy enquiry"}
      </button>
      {source && (
        <a className={act} href={source} target="_blank" rel="noreferrer">
          Open source →
        </a>
      )}
    </div>
  );
}

function Score({ score, label, tone }: { score: number; label: string; tone: string }) {
  return (
    <div className={cn("flex min-w-14 flex-col items-center rounded-lg px-2 py-1", tone)} title="Fit score: route match, quantity fit, experience, on-time record and price">
      <b className="text-xl leading-tight tabular-nums">{score}</b>
      <span className="text-[9px] font-bold tracking-wider">{label}</span>
    </div>
  );
}

function Metric({ label, value, sub, className }: { label: string; value: ReactNode; sub?: string; className?: string }) {
  return (
    <span className="flex min-w-0 flex-col gap-px">
      <small className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">{label}</small>
      <b className={cn("text-sm text-ink [overflow-wrap:anywhere]", className)}>{value}</b>
      {sub && <small className="text-[11px] text-ink-faint">{sub}</small>}
    </span>
  );
}

function HistoryCard({
  c, rank, contact, cheapest, qtyKg, isOpen, onToggle, actionProps,
}: {
  c: HistoryCandidate<PlainTransportJob>;
  rank: number;
  contact?: TransporterContact;
  cheapest: boolean;
  qtyKg: number;
  isOpen: boolean;
  onToggle: () => void;
  actionProps: Omit<Parameters<typeof Actions>[0], "name" | "phone" | "email" | "source">;
}) {
  const t = TIERS[c.tier];
  const why = [
    `${c.tier === 3 ? "Ran this exact route" : c.tier === 2 ? "Ran nearby routes" : "Ran routes in the same states"} ${c.trips.length}×`,
    c.qMin !== null && c.qMax !== null ? `${kgText(c.qMin)}–${kgText(c.qMax)} kg` : null,
    c.lastDay ? `last on ${formatDmy(c.lastDay)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="mb-2.5 rounded-xl border border-line bg-surface px-4 py-3.5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="text-xs font-bold text-ink-soft">#{rank}</span>
        <div className="min-w-0 flex-1">
          <h4 className="text-[15px] font-bold text-ink">{c.name}</h4>
          <p className="text-xs text-ink-soft">
            Atomgrid history · {c.loads || "load type not set"}
            {contact?.gstin ? ` · GSTIN ${contact.gstin}` : ""}
          </p>
        </div>
        <Score
          score={c.score}
          label="FIT"
          tone={c.score >= 85 ? "bg-emerald-50 text-emerald-700" : c.score >= 65 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}
        />
      </div>
      <div className="my-2 flex flex-wrap gap-1.5">
        <Pill tone={t.tone}>{t.label}</Pill>
        <Pill>
          {c.trips.length} trip{c.trips.length === 1 ? "" : "s"}
          {c.otherTrips ? ` (+${c.otherTrips} wider)` : ""}
        </Pill>
        {c.qtyFit === true && <Pill tone="ok">Quantity fits history</Pill>}
        {c.qtyFit === false && <Pill tone="warn">Quantity outside history</Pill>}
        {cheapest && <Pill tone="ok">Lowest ₹/kg</Pill>}
        {!contact && <Pill>Not in the contact master</Pill>}
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-x-3.5 gap-y-2 border-y border-dashed border-line py-2">
        <Metric label="Avg rate" value={c.avgPerKg ? `${inr2(c.avgPerKg)}/kg` : "—"} />
        {qtyKg > 0 && <Metric label={`Est. for ${kgText(qtyKg)} kg`} value={c.avgPerKg ? `≈ ${inr(c.avgPerKg * qtyKg)}` : "—"} />}
        <Metric label="Transit (median)" value={daysText(c.transit)} />
        <Metric
          label="On-time"
          value={c.onTimePct === null ? "—" : `${c.onTimePct}%`}
          className={toneText[onTimeTone(c.onTimePct)]}
          sub={c.onTimePct === null ? "" : `${c.onTimeBasis === "route" ? "on these trips" : "all routes"} · ${c.onTimeN}`}
        />
        <Metric label="Distance" value={kmText(c.km)} />
        <Metric label="Contact" value={contact?.phone || contact?.contactPerson || "—"} />
      </div>
      <div className="my-2 text-xs text-ink-soft">
        <b className="mr-1 text-ink">Why shown</b>
        {why}.
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Actions name={c.name} phone={contact?.phone} email={contact?.email} {...actionProps} />
        <Button variant="ghost" size="sm" className="ml-auto" onClick={onToggle}>
          {isOpen ? "Hide trips ▴" : "Show trips ▾"}
        </Button>
      </div>
      {isOpen && (
        <div className="mt-2.5 overflow-x-auto">
          <table className="min-w-full divide-y divide-line text-sm">
            <thead className="bg-muted/60">
              <tr>
                {["Job No.", "Date", "Match", "From", "To"].map((h) => (
                  <th key={h} className={thCls}>{h}</th>
                ))}
                {["Qty", "Cost", "₹/kg"].map((h) => (
                  <th key={h} className={cn(thCls, numCls)}>{h}</th>
                ))}
                <th className={thCls}>Load</th>
                <th className={cn(thCls, numCls)}>Transit</th>
                <th className={cn(thCls, numCls)}>Delay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {c.all.slice(0, 25).map((x) => (
                <tr key={x.id}>
                  <td className={cn(tdCls, "font-semibold")}>{x.jobNo || "—"}</td>
                  <td className={tdCls}>{formatDmy(x.actualEtd || x.plannedEtd) || "—"}</td>
                  <td className={tdCls}>
                    <Pill tone={TIERS[x.tier].tone}>{TIERS[x.tier].short}</Pill>
                  </td>
                  <td className={tdCls}>
                    {x.supplier || "—"} <span className="text-ink-faint">{x.from}</span>
                  </td>
                  <td className={tdCls}>
                    {x.customer || "—"} <span className="text-ink-faint">{x.to}</span>
                  </td>
                  <td className={cn(tdCls, numCls)}>{x.kg ? `${kgText(x.kg)} kg` : "—"}</td>
                  <td className={cn(tdCls, numCls)}>{x.cost ? inr(x.cost) : "—"}</td>
                  <td className={cn(tdCls, numCls)}>{x.perKg ? inr2(x.perKg) : "—"}</td>
                  <td className={tdCls}>{x.load || "—"}</td>
                  <td className={cn(tdCls, numCls)}>{daysText(x.transit)}</td>
                  <td className={cn(tdCls, numCls)}>
                    {x.delay === null ? <span className="text-ink-faint">—</span> : x.delay > 0 ? <span className="text-red-700">{x.delay} d late</span> : <span className="text-emerald-700">on time</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {c.all.length > 25 && <p className="mt-1 text-xs text-ink-soft">Showing the 25 closest / most recent of {c.all.length} trips.</p>}
        </div>
      )}
    </div>
  );
}

function LeadCard({ l, rank, zones, cargo, actionProps }: { l: RankedLead; rank: number; zones: string; cargo: string; actionProps: Omit<Parameters<typeof Actions>[0], "name" | "phone" | "email" | "source"> }) {
  return (
    <div className="mb-2.5 rounded-xl border border-l-4 border-line border-l-emerald-500 bg-surface px-4 py-3.5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="text-xs font-bold text-ink-soft">#{rank}</span>
        <div className="min-w-0 flex-1">
          <h4 className="text-[15px] font-bold text-ink">{l.name}</h4>
          <p className="text-xs text-ink-soft">
            {l.scope} public-network lead · {zones}
          </p>
        </div>
        <Score score={l.score} label="NETWORK" tone="bg-teal-50 text-teal-700" />
      </div>
      <div className="my-2 flex flex-wrap gap-1.5">
        <Pill tone="ok">{l.scope}</Pill>
        <Pill tone={l.cargoPublished ? "ok" : "warn"}>{l.cargoPublished ? `Publishes ${cargo.toLowerCase()} handling` : `${cargo} acceptance: verify`}</Pill>
        {l.weightFit === true && <Pill tone="ok">Weight fits published range</Pill>}
        {l.weightFit === false && <Pill tone="warn">Outside published weight</Pill>}
        {l.inHistory && <Pill>Also in our history</Pill>}
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-x-3.5 gap-y-2 border-y border-dashed border-line py-2">
        <Metric label="Coverage" value={l.regions.join(", ")} />
        <Metric label="Weight" value={l.min_kg !== null || l.max_kg !== null ? `${kgText(l.min_kg ?? 0)}–${kgText(l.max_kg ?? 0)} kg` : "Not published"} />
        <Metric label="Contact" value={l.contact || "Via website"} />
        <Metric label="Evidence" value={l.evidence} />
      </div>
      <div className="my-2 text-xs text-ink-soft">
        <b className="mr-1 text-ink">Why shown</b>
        {l.region === 30 ? "Their published network covers both ends." : "Their network covers one end of the route."} {l.note}
      </div>
      <Actions name={l.name} phone={l.contact} email={l.email} source={l.source} {...actionProps} />
    </div>
  );
}

export function Finder({ jobs, transporters, places }: { jobs: PlainTransportJob[]; transporters: TransporterContact[]; places: PlaceContact[] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [qty, setQty] = useState("");
  const [cargo, setCargo] = useState("Chemical");
  const [load, setLoad] = useState<"" | "PTL" | "FTL">("");
  const [show, setShow] = useState<"combined" | "history" | "public">("combined");
  const [open, setOpen] = useState("");
  const [copied, setCopied] = useState("");
  const [distance, setDistance] = useState<{ key: string; km: number | null }>({ key: "", km: null });

  const resolve = useMemo(() => makeTransporterResolver(transporters.map((t) => t.name)), [transporters]);
  const pins = useMemo(() => makePinResolver(places), [places]);
  const contacts = useMemo(() => Object.fromEntries(transporters.map((t) => [t.name, t])), [transporters]);
  const trips = useMemo(() => buildTrips(jobs, resolve, pins), [jobs, resolve, pins]);
  const overall = useMemo(() => overallRecord(trips), [trips]);
  const placeNames = useMemo(() => [...new Set(places.map((p) => p.name))].sort((a, b) => a.localeCompare(b)), [places]);

  const A = useMemo(() => resolvePlace(from, places, trips), [from, places, trips]);
  const B = useMemo(() => resolvePlace(to, places, trips), [to, places, trips]);
  const searching = Boolean(A.pin || B.pin);
  const qtyKg = amount(qty);

  const history = useMemo(
    () => (searching ? rankHistory({ trips, A: A.pin, B: B.pin, qty: qtyKg, load, overall }) : []),
    [searching, trips, A.pin, B.pin, qtyKg, load, overall],
  );
  const leads = useMemo(
    () => (searching && load !== "FTL" ? rankLeads({ A: A.pin, B: B.pin, qty: qtyKg, cargo, historyNames: Object.keys(overall) }) : []),
    [searching, A.pin, B.pin, qtyKg, cargo, load, overall],
  );

  // Road distance estimate for the route line (pincode → pincode).
  const routeKey = A.pin && B.pin ? `${A.pin}-${B.pin}` : "";
  useEffect(() => {
    if (!routeKey) return;
    let live = true;
    const [a, b] = routeKey.split("-");
    routeDistance(a, b)
      .then((km) => live && setDistance({ key: routeKey, km }))
      .catch(() => live && setDistance({ key: routeKey, km: null }));
    return () => {
      live = false;
    };
  }, [routeKey]);

  const exact = history.filter((c) => c.tier === 3);
  const exactFit = exact.filter((c) => c.qtyFit !== false);
  const exactOut = exact.filter((c) => c.qtyFit === false);
  const nearby = history.filter((c) => c.tier === 2);
  const states = history.filter((c) => c.tier === 1);
  const historyKm = (() => {
    const ks = exact.flatMap((c) => c.trips.map((t) => t.km)).filter((k): k is number => Boolean(k)).sort((a, b) => a - b);
    return ks.length ? ks[Math.floor(ks.length / 2)] : null;
  })();
  const estimatedKm = distance.key === routeKey ? distance.km : null;
  const priced = [...exactFit, ...nearby].filter((c) => c.avgPerKg);
  const cheapest = priced.length ? priced.reduce((m, c) => ((c.avgPerKg ?? 0) < (m.avgPerKg ?? 0) ? c : m)) : null;

  const sections: Array<{ key: string; tag: string; tone: string; items: typeof history }> = [];
  if (show !== "public") {
    if (exactFit.length) sections.push({ key: "exact", tag: B.pin && A.pin ? "Our history — exact route" : "Our history — exact pincode", tone: "bg-teal-50 text-teal-700", items: exactFit.slice(0, 8) });
    if (exactOut.length) sections.push({ key: "out", tag: "Our history — exact route, quantity outside their usual range", tone: "bg-amber-50 text-amber-800", items: exactOut.slice(0, 6) });
    if (nearby.length) sections.push({ key: "near", tag: "Our history — nearby (same postal districts)", tone: "bg-teal-50 text-teal-700", items: nearby.slice(0, 6) });
    if (states.length && exact.length + nearby.length < 5) sections.push({ key: "states", tag: "Our history — same states (wider network)", tone: "bg-teal-50 text-teal-700", items: states.slice(0, 6) });
  }

  const routeLabel = `${A.pin || "any"} → ${B.pin || "any"}`;
  const zones = `${zoneOf(A.pin) || "—"} → ${zoneOf(B.pin) || "—"}`;

  const enquiry: Enquiry = (name) => {
    const fromTxt = [A.note && A.note !== "from past trips" ? A.note : "", A.pin].filter(Boolean).join(", ") || "—";
    const toTxt = [B.note && B.note !== "from past trips" ? B.note : "", B.pin].filter(Boolean).join(", ") || "—";
    return (
      `Hi ${name}, please share your best rate and transit time for:\n` +
      `• From: ${fromTxt}\n• To: ${toTxt}\n` +
      `• Quantity: ${qtyKg ? `${kgText(qtyKg)} kg` : "to be confirmed"}${load ? ` (${load})` : ""}\n` +
      `• Cargo: ${cargo}\n\nThanks — Atomgrid Logistics`
    );
  };
  async function copyEnquiry(name: string) {
    try {
      await navigator.clipboard.writeText(enquiry(name));
      setCopied(name);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      // Clipboard blocked; nothing to do.
    }
  }
  const actionPropsFor = (name: string) => ({ enquiry, routeLabel, copied: copied === name, onCopy: copyEnquiry });

  const signal = !searching
    ? null
    : exactFit.length
      ? `${exactFit.length} transporter${exactFit.length > 1 ? "s have" : " has"} run this exact route${qtyKg ? " at a similar quantity" : ""}.`
      : exact.length
        ? `${exact.length} transporter${exact.length > 1 ? "s have" : " has"} run this exact route, but not at ${kgText(qtyKg)} kg.`
        : nearby.length
          ? `No exact-route history — ${nearby.length} transporter${nearby.length > 1 ? "s have" : " has"} run nearby routes.`
          : history.length
            ? "No exact or nearby history — showing transporters from the same states and public network leads."
            : "No history on this route — showing public network leads.";

  const directory = useMemo(
    () =>
      [...new Set([...transporters.map((t) => t.name), ...Object.keys(overall)])]
        .map((name) => ({ name, rec: overall[name], contact: contacts[name] }))
        .sort((a, b) => (b.rec?.trips ?? 0) - (a.rec?.trips ?? 0) || a.name.localeCompare(b.name)),
    [transporters, overall, contacts],
  );

  const pinHint = (text: string, r: { pin: string; note: string }) =>
    text ? (r.pin ? `PIN ${r.pin} · ${zoneOf(r.pin)}${r.note ? ` · ${r.note}` : ""}` : "No pincode found — try a pincode") : " ";

  return (
    <div className="space-y-4">
      <Card className="px-5 py-4">
        <div className="flex flex-wrap items-start gap-3">
          <label className="flex min-w-0 flex-[1_1_220px] flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">From (pickup)</span>
            <Input list="tf-places" placeholder="Supplier, town or pincode" value={from} onChange={(e) => setFrom(e.target.value)} />
            <small className={cn("min-h-3.5 text-[11px]", A.note === "not found" ? "text-red-700" : "text-ink-faint")}>{pinHint(from, A)}</small>
          </label>
          <Button
            variant="secondary"
            className="mt-5"
            title="Swap"
            onClick={() => {
              setFrom(to);
              setTo(from);
            }}
          >
            ⇄
          </Button>
          <label className="flex min-w-0 flex-[1_1_220px] flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">To (drop)</span>
            <Input list="tf-places" placeholder="Customer, town or pincode" value={to} onChange={(e) => setTo(e.target.value)} />
            <small className={cn("min-h-3.5 text-[11px]", B.note === "not found" ? "text-red-700" : "text-ink-faint")}>{pinHint(to, B)}</small>
          </label>
          <label className="flex flex-[0_1_140px] flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">Quantity (kg)</span>
            <Input inputMode="numeric" placeholder="e.g. 850" value={qty} onChange={(e) => setQty(e.target.value)} />
          </label>
          <label className="flex flex-[0_1_160px] flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">Cargo type</span>
            <Select value={cargo} onChange={(e) => setCargo(e.target.value)}>
              {CARGO_TYPES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </label>
          <label className="flex flex-[0_1_140px] flex-col gap-1">
            <span className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">Load</span>
            <Select value={load} onChange={(e) => setLoad(e.target.value as "" | "PTL" | "FTL")}>
              <option value="">PTL or FTL</option>
              <option value="PTL">PTL only</option>
              <option value="FTL">FTL only</option>
            </Select>
          </label>
        </div>
        <datalist id="tf-places">
          {placeNames.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <div className="mt-2 flex flex-wrap items-center gap-2.5">
          <span className="text-xs text-ink-soft">Exact route → nearby districts → same states → public PTL network.</span>
          <div className="ml-auto inline-flex overflow-hidden rounded-full border border-line" role="group" aria-label="Show">
            {(
              [
                ["combined", "Combined"],
                ["history", "Our history"],
                ["public", "Public leads"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                className={cn("px-3.5 py-1.5 text-xs font-bold", show === k ? "bg-brand-600 text-white" : "text-ink-soft hover:bg-muted")}
                onClick={() => setShow(k)}
              >
                {l}
              </button>
            ))}
          </div>
          {(from || to || qty) && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setFrom("");
                setTo("");
                setQty("");
                setOpen("");
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </Card>

      {searching ? (
        <>
          <div className="flex gap-3 rounded-lg border border-line bg-muted/40 px-4 py-3.5 text-sm leading-relaxed text-ink">
            <div className="text-lg text-brand-600">✦</div>
            <div>
              <div className="text-base font-bold">
                {routeLabel}{" "}
                <span className="ml-1.5 text-xs font-semibold text-ink-soft">
                  {zones}
                  {historyKm ? ` · ~${kmText(historyKm)}` : estimatedKm ? ` · ~${kmText(estimatedKm)} by road (estimate)` : ""}
                  {qtyKg ? ` · ${kgText(qtyKg)} kg` : ""} · {cargo}
                  {load ? ` · ${load}` : ""}
                </span>
              </div>
              <b>{signal}</b>
              {cheapest && cheapest.avgPerKg && (
                <span>
                  {" "}
                  Lowest past rate {cheapest.tier === 3 ? "on this route" : "nearby"}: <b>{cheapest.name}</b> at {inr2(cheapest.avgPerKg)}/kg
                  {qtyKg ? ` (≈ ${inr(cheapest.avgPerKg * qtyKg)})` : ""}.
                </span>
              )}
              <span className="mt-0.5 block text-xs text-amber-800">{cargoCaution(cargo)} Public leads must be confirmed before dispatch.</span>
            </div>
          </div>

          {sections.map((s) => (
            <section key={s.key}>
              <div className={cn("mb-2 inline-block rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider", s.tone)}>
                {s.tag} · {s.items.length}
              </div>
              {s.items.map((c, i) => (
                <HistoryCard
                  key={c.name}
                  c={c}
                  rank={i + 1}
                  contact={contacts[c.name]}
                  cheapest={cheapest?.name === c.name}
                  qtyKg={qtyKg}
                  isOpen={open === c.name}
                  onToggle={() => setOpen(open === c.name ? "" : c.name)}
                  actionProps={actionPropsFor(c.name)}
                />
              ))}
            </section>
          ))}
          {show !== "public" && !sections.length && (
            <Card className="px-5 py-6 text-center text-sm text-ink-faint">No history matches{load ? ` for ${load}` : ""} on this route.</Card>
          )}

          {show !== "history" && (
            <section>
              <div className="mb-2 inline-block rounded-full bg-emerald-50 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider text-emerald-700">
                Public network — regional + pan-India PTL{load === "FTL" ? "" : ` · ${Math.min(10, leads.length)}`}
              </div>
              {load === "FTL" ? (
                <Card className="px-5 py-4 text-sm text-ink-soft">Public leads are PTL networks: switch Load to “PTL or FTL” or “PTL only” to see them.</Card>
              ) : (
                leads.slice(0, 10).map((l, i) => <LeadCard key={l.name} l={l} rank={i + 1} zones={zones} cargo={cargo} actionProps={actionPropsFor(l.name)} />)
              )}
            </section>
          )}
          <p className="text-xs text-ink-soft">
            Fit score (0–100) = route match (40) + quantity fit (20) + experience (15) + on-time record (15) + price vs the cheapest similar option (10). Rates are past Total
            Logistics Cost ÷ quantity: a guide for negotiating, not a quote. Public leads come from company websites and are not proof of pincode serviceability, rate or
            acceptance.
          </p>
        </>
      ) : (
        <Card>
          <CardHeader title="Transporter directory" description="Every transporter contact and every transporter in Domestic MIS · enter a route above to rank them" />
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-line text-sm">
              <thead className="bg-muted/60">
                <tr>
                  <th className={thCls}>Transporter</th>
                  <th className={cn(thCls, numCls)}>Trips</th>
                  <th className={cn(thCls, numCls)}>On-time</th>
                  <th className={thCls}>Last used</th>
                  <th className={thCls}>Contact</th>
                  <th className={thCls}>GSTIN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {directory.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-ink-faint">No transporters yet.</td>
                  </tr>
                )}
                {directory.map((d) => {
                  const pct = d.rec?.onTimePct ?? null;
                  return (
                    <tr key={d.name} className="hover:bg-muted/40">
                      <td className={cn(tdCls, "font-semibold")}>{d.name}</td>
                      <td className={cn(tdCls, numCls)}>{d.rec?.trips || <span className="text-ink-faint">0</span>}</td>
                      <td className={cn(tdCls, numCls, toneText[onTimeTone(pct)])}>{pct === null ? "—" : `${pct}%`}</td>
                      <td className={tdCls}>{formatDmy(d.rec?.last) || "—"}</td>
                      <td className={tdCls}>
                        {d.contact?.phone ? (
                          <a className="font-medium text-brand-700 hover:underline" href={`tel:+${phoneDigits(d.contact.phone)}`}>
                            {d.contact.phone}
                          </a>
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                      </td>
                      <td className={cn(tdCls, "font-mono text-xs text-ink-soft")}>{d.contact?.gstin || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
