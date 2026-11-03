"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { formatDmy } from "@/lib/ops/dates";
import {
  AGE_BUCKETS, PAYABLES_CSV_HEADER, PAY_STAGES, buildPayables, bucketLabel, groupPayables, isAligned,
  makeTransporterResolver, stageOf, type AgeBucket, type PayStage,
} from "@/lib/ops/transport";
import type { PlainTransportJob } from "../data";
import { Pill, Tile, downloadCsv, inr, numCls, stickyCls, tdCls, thCls } from "../ui";

const ageTone = (age: number) => (age > 60 ? "text-red-700" : age > 30 ? "text-amber-700" : "");

export function PayablesBoard({ jobs, transporterNames, today }: { jobs: PlainTransportJob[]; transporterNames: string[]; today: string }) {
  const [open, setOpen] = useState("");
  const [bucket, setBucket] = useState<AgeBucket | "">("");
  const [stage, setStage] = useState<PayStage | "">("");
  const [search, setSearch] = useState("");

  const resolve = useMemo(() => makeTransporterResolver(transporterNames), [transporterNames]);
  const { dues, upcoming } = useMemo(() => buildPayables(jobs, resolve, today), [jobs, resolve, today]);

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    return dues.filter(
      (d) =>
        (!bucket || d.bucket === bucket) &&
        (!stage || stageOf(d) === stage) &&
        (!t || `${d.transporter} ${d.jobNo} ${d.customer ?? ""} ${d.supplier ?? ""}`.toLowerCase().includes(t)),
    );
  }, [dues, bucket, stage, search]);
  const byTransporter = useMemo(() => groupPayables(filtered), [filtered]);

  const bucketTotals = useMemo(() => {
    const t = Object.fromEntries(AGE_BUCKETS.map((b) => [b.key, { amt: 0, n: 0 }])) as Record<AgeBucket, { amt: number; n: number }>;
    for (const d of dues) { t[d.bucket].amt += d.amount; t[d.bucket].n++; }
    return t;
  }, [dues]);
  const stageTotals = useMemo(() => {
    const t = { pending: { amt: 0, n: 0 }, aligned: { amt: 0, n: 0 } };
    for (const d of dues) { const k = stageOf(d); t[k].amt += d.amount; t[k].n++; }
    return t;
  }, [dues]);
  const grand = dues.reduce((s, d) => s + d.amount, 0);
  const shownTotal = filtered.reduce((s, d) => s + d.amount, 0);
  const partial = dues.filter((d) => /partial/i.test(d.transportPaymentStatus ?? "")).length;
  const plural = (n: number) => `${n} shipment${n === 1 ? "" : "s"}`;

  function exportCsv() {
    downloadCsv(
      `transporter-payables-${today}.csv`,
      PAYABLES_CSV_HEADER,
      byTransporter.flatMap((r) =>
        r.items.map((d) => [
          r.name, d.jobNo, d.customer, d.supplier, formatDmy(d.actualEtd), formatDmy(d.actualEta), d.age, bucketLabel(d.bucket),
          Math.round(d.amount), Math.round(d.totalLogisticsCost ?? 0), d.transportPaymentStatus || "Not set",
          PAY_STAGES[stageOf(d)].label, d.hasPod ? "Yes" : "No",
        ]),
      ),
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Tile value={inr(grand)} label="Total outstanding" sub={plural(dues.length)} active={bucket === ""} onClick={() => setBucket("")} />
        {AGE_BUCKETS.map((b) => (
          <Tile
            key={b.key}
            value={inr(bucketTotals[b.key].amt)}
            label={b.label}
            sub={plural(bucketTotals[b.key].n)}
            tone={b.tone as "" | "warn" | "bad"}
            active={bucket === b.key}
            onClick={() => setBucket(bucket === b.key ? "" : b.key)}
            title="Click to show only this age group"
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(Object.keys(PAY_STAGES) as PayStage[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setStage(stage === k ? "" : k)}
            title="Click to show only these"
            className={cn("flex flex-col gap-0.5 rounded-lg border border-line bg-surface px-4 py-3 text-left shadow-sm", stage === k && "ring-2 ring-brand-500")}
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{PAY_STAGES[k].label}</span>
            <span className={cn("text-xl font-semibold tabular-nums", k === "pending" ? "text-red-700" : "text-teal-700")}>{inr(stageTotals[k].amt)}</span>
            <span className="text-xs text-ink-faint">
              {plural(stageTotals[k].n)} · {PAY_STAGES[k].sub}
            </span>
            <span className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <i className={cn("block h-full", k === "pending" ? "bg-blue-500" : "bg-teal-500")} style={{ width: `${grand ? (stageTotals[k].amt / grand) * 100 : 0}%` }} />
            </span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input className="max-w-xs" placeholder="Search transporter, job no., customer…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
        {stage && (
          <Button variant="secondary" size="sm" onClick={() => setStage("")}>
            Showing {PAY_STAGES[stage].label} · clear ✕
          </Button>
        )}
        {bucket && (
          <Button variant="secondary" size="sm" onClick={() => setBucket("")}>
            Showing {bucketLabel(bucket)} · clear ✕
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!filtered.length}>
          Export CSV ↓
        </Button>
      </div>

      <Card>
        <CardHeader title="Ageing by transporter" description="Click a transporter to see the shipments behind the amount" />
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-line text-sm">
            <thead className="bg-muted/60">
              <tr>
                <th className={cn(thCls, stickyCls, "bg-muted")}>Transporter</th>
                {AGE_BUCKETS.map((b) => (
                  <th key={b.key} className={cn(thCls, numCls)}>{b.label}</th>
                ))}
                <th className={cn(thCls, numCls)}>Not yet aligned</th>
                <th className={cn(thCls, numCls)}>Aligned, not disbursed</th>
                <th className={cn(thCls, numCls)}>Total due</th>
                <th className={cn(thCls, numCls)}>Oldest</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {byTransporter.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-ink-faint">
                    {dues.length
                      ? "Nothing matches this filter."
                      : jobs.length
                        ? "Nothing outstanding: every delivered shipment with an AG to Pay amount is marked Paid."
                        : "No Domestic MIS shipments yet."}
                  </td>
                </tr>
              ) : (
                byTransporter.map((r) => {
                  const isOpen = open === r.name;
                  return (
                    <Fragment key={r.name}>
                      <tr className={cn("cursor-pointer hover:bg-muted/40", isOpen && "bg-muted/40")} onClick={() => setOpen(isOpen ? "" : r.name)}>
                        <td className={cn(tdCls, stickyCls)}>
                          {isOpen ? "▾" : "▸"} <b>{r.name}</b> <span className="text-ink-faint">· {r.count}</span>
                        </td>
                        {AGE_BUCKETS.map((b) => (
                          <td key={b.key} className={cn(tdCls, numCls, r.buckets[b.key] > 0 && (b.key === "b4" ? "text-red-700" : b.key === "b2" || b.key === "b3" ? "text-amber-700" : ""))}>
                            {r.buckets[b.key] ? inr(r.buckets[b.key]) : <span className="text-ink-faint">—</span>}
                          </td>
                        ))}
                        <td className={cn(tdCls, numCls)}>{r.pending ? inr(r.pending) : <span className="text-ink-faint">—</span>}</td>
                        <td className={cn(tdCls, numCls, "text-teal-700")}>{r.aligned ? inr(r.aligned) : <span className="text-ink-faint">—</span>}</td>
                        <td className={cn(tdCls, numCls, "font-semibold")}>{inr(r.total)}</td>
                        <td className={cn(tdCls, numCls, ageTone(r.oldest))}>{r.oldest} d</td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={10} className="bg-muted/20 px-4 pt-1 pb-3 pl-8">
                            <table className="min-w-full text-sm">
                              <thead>
                                <tr>
                                  {["Job No.", "Customer", "Supplier", "Dispatched", "Delivered"].map((h) => (
                                    <th key={h} className={thCls}>{h}</th>
                                  ))}
                                  <th className={cn(thCls, numCls)}>Age</th>
                                  <th className={cn(thCls, numCls)}>AG to Pay</th>
                                  <th className={cn(thCls, numCls)}>Total cost</th>
                                  <th className={thCls}>Status</th>
                                  <th className={thCls}>POD</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-line">
                                {r.items.map((d) => (
                                  <tr key={d.id}>
                                    <td className={tdCls}>
                                      <Link href={`/b2b/mis?q=${encodeURIComponent(d.jobNo)}`} className="font-medium text-brand-700 hover:underline">
                                        {d.jobNo || "—"}
                                      </Link>
                                    </td>
                                    <td className={tdCls}>{d.customer || "—"}</td>
                                    <td className={tdCls}>{d.supplier || "—"}</td>
                                    <td className={tdCls}>{formatDmy(d.actualEtd) || "—"}</td>
                                    <td className={tdCls}>{formatDmy(d.actualEta) || "—"}</td>
                                    <td className={cn(tdCls, numCls, ageTone(d.age))}>{d.age} d</td>
                                    <td className={cn(tdCls, numCls)}>{inr(d.amount)}</td>
                                    <td className={cn(tdCls, numCls, "text-ink-soft")}>{d.totalLogisticsCost ? inr(d.totalLogisticsCost) : "—"}</td>
                                    <td className={tdCls}>
                                      <Pill tone={isAligned(d) ? "teal" : /partial/i.test(d.transportPaymentStatus ?? "") ? "warn" : "bad"}>{d.transportPaymentStatus || "Not set"}</Pill>
                                    </td>
                                    <td className={tdCls}>{d.hasPod ? <Pill tone="ok">✓ received</Pill> : <Pill>missing</Pill>}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
            {byTransporter.length > 1 && (
              <tfoot className="bg-muted/60 font-semibold">
                <tr>
                  <td className={cn(tdCls, stickyCls, "bg-muted")}>Total{bucket || stage || search ? " (filtered)" : ""}</td>
                  {AGE_BUCKETS.map((b) => (
                    <td key={b.key} className={cn(tdCls, numCls)}>{inr(byTransporter.reduce((s, r) => s + r.buckets[b.key], 0))}</td>
                  ))}
                  <td className={cn(tdCls, numCls)}>{inr(byTransporter.reduce((s, r) => s + r.pending, 0))}</td>
                  <td className={cn(tdCls, numCls)}>{inr(byTransporter.reduce((s, r) => s + r.aligned, 0))}</td>
                  <td className={cn(tdCls, numCls)}>{inr(shownTotal)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-xs text-ink-soft">
          Only delivered shipments are payables; age counts from the delivery date (Actual ETA, else Actual ETD). Amount owed = <b>Logistics Cost (AG to Pay)</b>, less
          Transport Paid So Far on a Partially Paid shipment; <b>Total Logistics Cost</b> is shown alongside for reference. Shipments with no AG to Pay amount, “To pay”
          shipments (customer pays on delivery) and “Sx to pay” shipments (supplier pays) are not payables. <b>Aligned, not disbursed</b> = Transport Payment Status
          “Payment Aligned”: approved for payment but not yet paid out, so still owed.
          {partial > 0 && (
            <>
              {" "}
              {partial} shipment{partial > 1 ? "s are" : " is"} <b>Partially Paid</b>; the amount paid so far is subtracted.
            </>
          )}
        </p>
      </Card>

      {upcoming.length > 0 && (
        <p className="text-sm text-ink-soft">
          Coming up: {plural(upcoming.length)} not yet delivered (planned or in transit), with {inr(upcoming.reduce((s, d) => s + d.amount, 0))} AG to Pay. They become
          payable once delivered.
        </p>
      )}
    </div>
  );
}
