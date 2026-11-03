"use client";

import { Fragment, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatDmy } from "@/lib/ops/dates";
import {
  AGE_BANDS,
  EXPIRY,
  LOCATIONS,
  byMaterial,
  compareStock,
  planPick,
  shortLoc,
  showDate,
  stockChecks,
  stockLines,
  type CompareStatus,
  type ExpiryClass,
  type InwardEntry,
  type OutwardEntry,
  type PickRule,
  type Psv,
  type StockCheck,
  type StockLine,
} from "@/lib/batch-inventory";
import { inputCls, inr, kg, sheetTable, stickyCol, td, th } from "../_components/kit";
import { readCountFile, uploadWarehouseMis } from "./actions";
import { emptyFilter, filterLines, sortLines, sortMaterials, type Sort, type SortKey, type StockFilter } from "./_lib/view";

type Panel = "" | "checks" | "count" | "mis";
const sum = (ls: StockLine[]) => ls.reduce((a, l) => a + l.instockQty, 0);
const ageTone = (a: number | null) => (a === null ? "" : a > 180 ? "bg-red-50 text-red-700" : a > 90 ? "bg-amber-50 text-amber-800" : "bg-muted text-ink-soft");
const VIEW_KEY = "batch-stock-view";

export function StockView({
  inward,
  outward,
  today,
  canEdit,
  warehouseMis,
  initialQ,
}: {
  inward: (InwardEntry & { id: string })[];
  outward: (OutwardEntry & { id: string })[];
  today: string;
  canEdit: boolean;
  warehouseMis: { fileName: string; countDate: string; uploadedAt: string; lines: number } | null;
  initialQ: string;
}) {
  const [view, setView] = useState<"material" | "batch">("material");
  const [f, setF] = useState<StockFilter>({ ...emptyFilter, q: initialQ });
  const [open, setOpen] = useState("");
  const [sort, setSort] = useState<Sort>({ k: "stock", d: -1 });
  const [panel, setPanel] = useState<Panel>("");

  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a remembered per-viewer preference, read after hydration
      if (v === "batch" || v === "material") setView(v);
    } catch {}
  }, []);
  const pickView = (v: "material" | "batch") => {
    setView(v);
    setOpen("");
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {}
  };
  const set = (k: keyof StockFilter, v: string) => setF((x) => ({ ...x, [k]: v }));

  const all = useMemo(() => stockLines(inward, outward, today), [inward, outward, today]);
  const checks = useMemo(() => stockChecks(inward, outward, all, today), [inward, outward, all, today]);
  const lines = useMemo(() => filterLines(all, f), [all, f]);
  const mats = useMemo(() => sortMaterials(byMaterial(lines).filter((x) => Math.abs(x.stock) > 0.0005), sort), [lines, sort]);
  const batchRows = useMemo(() => sortLines(lines, sort), [lines, sort]);
  const net = useMemo(() => byMaterial(all).filter((m) => Math.abs(m.stock) > 0.0005), [all]);
  const types = useMemo(() => [...new Set(all.map((l) => l.type || "—"))].sort(), [all]);
  const warehouses = useMemo(() => [...new Set([...LOCATIONS, ...all.map((l) => l.location).filter(Boolean)])], [all]);
  const pos = all.filter((l) => l.instockQty > 0);
  const issues = checks.filter((c) => c.level !== "info");
  const chips = [
    f.wh && { k: "wh" as const, label: shortLoc(f.wh) },
    f.type && { k: "type" as const, label: f.type },
    f.band && { k: "band" as const, label: AGE_BANDS.find((b) => b.key === f.band)?.label || f.band },
    f.exp && { k: "exp" as const, label: EXPIRY[f.exp as ExpiryClass] },
    f.q && { k: "q" as const, label: `“${f.q}”` },
  ].filter(Boolean) as { k: keyof StockFilter; label: string }[];
  const sortBy = (k: SortKey) => setSort(sort.k === k ? { k, d: sort.d === 1 ? -1 : 1 } : { k, d: k === "material" || k === "toExpiry" ? 1 : -1 });
  const exportHref = `/b2b/inventory/stock/export?${new URLSearchParams(f)}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-ink-soft">
          <b className="text-ink">{kg(Math.round(sum(all)))} kg</b> in stock
          {warehouses.map((w) => {
            const v = sum(all.filter((l) => l.location === w));
            return Math.abs(v) > 0.5 ? <span key={w}> · {shortLoc(w)} {kg(Math.round(v))}</span> : null;
          })}
          <span> · {net.filter((m) => m.stock > 0).length} materials · {pos.length} batches</span>
        </p>
        <Button variant="secondary" size="sm" className={cn(panel === "checks" && "ring-2 ring-brand-500/40")} onClick={() => setPanel(panel === "checks" ? "" : "checks")}>
          <span className={cn("inline-block h-2 w-2 rounded-full", issues.length ? "bg-red-500" : "bg-emerald-500")} /> Checks{checks.length ? ` · ${checks.reduce((a, c) => a + c.rows.length, 0)}` : ""}
        </Button>
        <Button variant="secondary" size="sm" className={cn(panel === "count" && "ring-2 ring-brand-500/40")} onClick={() => setPanel(panel === "count" ? "" : "count")}>Compare with warehouse stock</Button>
        {canEdit && <Button variant="secondary" size="sm" className={cn(panel === "mis" && "ring-2 ring-brand-500/40")} onClick={() => setPanel(panel === "mis" ? "" : "mis")}>Upload warehouse MIS</Button>}
        <a className={buttonClass("secondary", "sm")} href={exportHref}>Export XLSX</a>
      </div>

      {panel === "checks" && <ChecksPanel checks={checks} onClose={() => setPanel("")} />}
      {panel === "count" && <CountPanel all={all} inward={inward} warehouses={warehouses} today={today} onClose={() => setPanel("")} />}
      {panel === "mis" && <MisPanel current={warehouseMis} onClose={() => setPanel("")} />}

      <Planner all={all} warehouses={warehouses} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-md border border-line" role="group" aria-label="View">
          {(["material", "batch"] as const).map((v) => (
            <button key={v} type="button" className={cn("px-3 py-1.5 text-xs font-semibold", view === v ? "bg-brand-600 text-white" : "bg-surface text-ink-soft hover:bg-muted")} onClick={() => pickView(v)}>
              {v === "material" ? "By material" : "By batch"}
            </button>
          ))}
        </div>
        <input className={cn(inputCls, "w-64")} type="search" placeholder="Search material, batch, supplier, GRN…" value={f.q} onChange={(e) => set("q", e.target.value)} />
        <select className={cn(inputCls, "w-auto")} value={f.wh} onChange={(e) => set("wh", e.target.value)}><option value="">All warehouses</option>{warehouses.map((w) => <option key={w}>{w}</option>)}</select>
        <select className={cn(inputCls, "w-auto")} value={f.type} onChange={(e) => set("type", e.target.value)}><option value="">All types</option>{types.map((t) => <option key={t}>{t}</option>)}</select>
        <select className={cn(inputCls, "w-auto")} value={f.band} onChange={(e) => set("band", e.target.value)}><option value="">Any age</option>{AGE_BANDS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}</select>
        <select className={cn(inputCls, "w-auto")} value={f.exp} onChange={(e) => set("exp", e.target.value)}><option value="">Any expiry</option>{Object.entries(EXPIRY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {chips.map((c) => (
            <button key={c.k} type="button" className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-ink-soft hover:bg-muted" onClick={() => set(c.k, "")}>
              {c.label} <span className="text-ink-faint">×</span>
            </button>
          ))}
          <button type="button" className="font-semibold text-brand-700 underline" onClick={() => setF(emptyFilter)}>Clear all</button>
          <span className="text-ink-faint">{view === "material" ? `${mats.length} materials` : `${lines.length} lines`} · {kg(Math.round(sum(lines)))} kg</span>
        </div>
      )}

      <div className="max-h-[70vh] overflow-auto rounded-lg border border-line bg-surface">
        {view === "material" ? (
          <table className={sheetTable}>
            <thead>
              <tr>
                <Th sort={sort} onSort={sortBy} k="material">Material</Th><th className={th}>Type</th><Th sort={sort} onSort={sortBy} k="stock" right>Stock (kg)</Th><th className={cn(th, "text-right")}>Packs</th><Th sort={sort} onSort={sortBy} k="batches" right>Batches</Th>
                <th className={th}>Warehouses</th><th className={cn(th, "text-right")}>Expired / ≤ 90 d (kg)</th><Th sort={sort} onSort={sortBy} k="toExpiry">Next expiry</Th><Th sort={sort} onSort={sortBy} k="value" right>Value</Th><Th sort={sort} onSort={sortBy} k="oldest" right>Oldest</Th><th className={th}>Licence</th>
              </tr>
            </thead>
            <tbody>
              {!mats.length ? (
                <tr><td colSpan={11} className="px-4 py-10 text-center text-sm text-ink-faint">{all.length ? "Nothing matches." : "No stock yet — add Batch inward lines first."}</td></tr>
              ) : (
                mats.map((m) => {
                  const isOpen = open === m.material;
                  return (
                    <Fragment key={m.material}>
                      <tr className="cursor-pointer hover:bg-muted/40" onClick={() => setOpen(isOpen ? "" : m.material)}>
                        <td className={cn(td, stickyCol, "max-w-80 truncate font-semibold")} title={m.material}><span className="mr-1 inline-block w-3 text-ink-faint">{isOpen ? "▾" : "▸"}</span>{m.material}</td>
                        <td className={td}>{m.type && <span className="rounded-full border border-line bg-muted px-2 py-0.5 text-[11px] font-semibold">{m.type}</span>}</td>
                        <td className={cn(td, "text-right font-semibold tabular-nums", m.stock < 0 ? "text-red-600" : "text-emerald-700")}>{kg(m.stock)}</td>
                        <td className={cn(td, "text-right tabular-nums")}>{kg(m.packs) || "—"}</td>
                        <td className={cn(td, "text-right tabular-nums")}>{m.batches}</td>
                        <td className={td}>{Object.entries(m.byWh).map(([w, v]) => <span key={w} className="mr-2 text-ink-soft" title={`${w}: ${kg(v)} kg`}>{shortLoc(w)} <b className="text-ink">{kg(Math.round(v))}</b></span>)}</td>
                        <td className={cn(td, "text-right tabular-nums")}>{m.expiredKg ? <span className="text-red-600">{kg(m.expiredKg)}</span> : "—"} / {m.soonKg ? <span className="text-amber-700">{kg(m.soonKg)}</span> : "—"}</td>
                        <td className={td}>{m.nextExpiry ? showDate(m.nextExpiry) : "—"}</td>
                        <td className={cn(td, "text-right tabular-nums")}>{inr(m.value)}</td>
                        <td className={cn(td, "text-right")}>{m.oldest === null ? "—" : <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", ageTone(m.oldest))}>{m.oldest} d</span>}</td>
                        <td className={cn(td, "text-ink-soft")}>{m.license}</td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={11} className="border-b border-line bg-muted/30 px-8 py-2">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-[10px] uppercase tracking-wide text-ink-faint">
                                  <th className="px-2 py-1">Batch</th><th className="px-2 py-1">Product name</th><th className="px-2 py-1">Warehouse</th><th className="px-2 py-1 text-right">Stock (kg)</th><th className="px-2 py-1 text-right">Packs</th><th className="px-2 py-1">Exp</th><th className="px-2 py-1">GRN</th><th className="px-2 py-1">Inward</th><th className="px-2 py-1 text-right">Ageing</th>
                                </tr>
                              </thead>
                              <tbody>
                                {m.lines.slice().sort((a, b) => a.inwardDate.localeCompare(b.inwardDate)).map((l) => (
                                  <tr key={l.id} className="border-t border-line/60">
                                    <td className="px-2 py-1 font-semibold">{l.batchNo || "no batch"}</td>
                                    <td className="px-2 py-1 text-ink-soft">{l.productName}</td>
                                    <td className="px-2 py-1">{shortLoc(l.location)}</td>
                                    <td className={cn("px-2 py-1 text-right tabular-nums", l.instockQty < 0 && "text-red-600")}>{kg(l.instockQty)}</td>
                                    <td className="px-2 py-1 text-right tabular-nums">{l.packs === null ? "—" : `${kg(l.packs)} × ${kg(l.packSize)}`}</td>
                                    <td className={cn("px-2 py-1", l.expiry === "expired" ? "text-red-600" : l.expiry === "soon" ? "text-amber-700" : "")}>{l.expIso ? showDate(l.expIso) : "—"}</td>
                                    <td className="px-2 py-1">{l.grnNo || "—"}</td>
                                    <td className="px-2 py-1">{showDate(l.inwardDate)}</td>
                                    <td className="px-2 py-1 text-right">{l.ageing === null ? (l.futureInward ? <span className="text-amber-700">future date</span> : "—") : `${l.ageing} d`}</td>
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
          </table>
        ) : (
          <table className={sheetTable}>
            <thead>
              <tr>
                <Th sort={sort} onSort={sortBy} k="material">Material</Th><th className={th}>Batch No.</th><th className={th}>Warehouse</th><Th sort={sort} onSort={sortBy} k="stock" right>Stock (kg)</Th><th className={cn(th, "text-right")}>Packs</th><th className={th}>Packaging</th>
                <th className={th}>Mfg</th><th className={th}>Exp</th><Th sort={sort} onSort={sortBy} k="toExpiry" right>To expiry</Th><Th sort={sort} onSort={sortBy} k="oldest" right>Ageing</Th><th className={cn(th, "text-right")}>₹/kg</th><Th sort={sort} onSort={sortBy} k="value" right>Value</Th><th className={th}>GRN</th><th className={th}>Job No.</th><th className={th}>Supplier</th>
              </tr>
            </thead>
            <tbody>
              {!batchRows.length ? (
                <tr><td colSpan={15} className="px-4 py-10 text-center text-sm text-ink-faint">Nothing matches.</td></tr>
              ) : (
                batchRows.map((l) => (
                  <tr key={l.id} className="hover:bg-muted/40">
                    <td className={cn(td, stickyCol, "max-w-72")}>
                      <b className="block truncate" title={l.material}>{l.material}</b>
                      {l.productName && l.productName !== l.material && <span className="block truncate text-[11px] text-ink-faint">{l.productName}</span>}
                    </td>
                    <td className={td}>{l.batchNo}</td>
                    <td className={td}>{shortLoc(l.location)}</td>
                    <td className={cn(td, "text-right font-semibold tabular-nums", l.instockQty < 0 ? "text-red-600" : "text-emerald-700")}>{kg(l.instockQty)}</td>
                    <td className={cn(td, "text-right tabular-nums")}>{l.packs === null ? "—" : kg(l.packs)}</td>
                    <td className={cn(td, "max-w-48 truncate")} title={l.packaging}>{l.packaging.replace(/\n+/g, " · ")}</td>
                    <td className={td}>{showDate(l.mfgDate)}</td>
                    <td className={td}>{showDate(l.expDate)}</td>
                    <td className={cn(td, "text-right")}>{l.toExpiry === null ? "—" : <span className={l.expiry === "expired" ? "text-red-600" : l.expiry === "soon" ? "text-amber-700" : ""}>{l.toExpiry < 0 ? `${-l.toExpiry} d ago` : `${l.toExpiry} d`}</span>}</td>
                    <td className={cn(td, "text-right")}>{l.ageing === null ? (l.futureInward ? <span className="text-amber-700">future date</span> : "—") : <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", ageTone(l.ageing))}>{l.ageing} d</span>}</td>
                    <td className={cn(td, "text-right tabular-nums")}>{l.purchaseRate ?? "—"}</td>
                    <td className={cn(td, "text-right tabular-nums")}>{inr(l.value)}</td>
                    <td className={td}>{l.grnNo}</td>
                    <td className={td}>{l.jobNo}</td>
                    <td className={td}>{l.supplier}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-ink-soft">{view === "material" ? `${mats.length} materials` : `${batchRows.length} lines`} · {kg(Math.round(sum(lines)))} kg</p>
      <p className="text-xs text-ink-faint">
        Stock is netted on quantity per material: a batch line that shows negative (because the sheet booked a batch&apos;s whole Outward Qty on its first line) is offset by the other lines. Packs = stock ÷ pack size (Net Weight ÷ Units). Ageing = days since inward. Expiry dates written as month and year only (“Jun-28”) count to the end of that month. Dispatches entered in Batch outward come off their batch oldest line first, matched to the same material.
      </p>
    </div>
  );
}

function Th({ k, children, right, sort, onSort }: { k: SortKey; children: ReactNode; right?: boolean; sort: Sort; onSort: (k: SortKey) => void }) {
  return (
    <th className={cn(th, "cursor-pointer select-none hover:text-ink", right && "text-right")} onClick={() => onSort(k)}>
      {children}
      {sort.k === k ? (sort.d > 0 ? " ▲" : " ▼") : ""}
    </th>
  );
}

/* ---------- What to look at behind the figures ---------- */
function ChecksPanel({ checks, onClose }: { checks: StockCheck[]; onClose: () => void }) {
  const [openK, setOpenK] = useState(checks[0]?.key || "");
  const tone = { bad: "border-l-red-500", warn: "border-l-amber-500", info: "border-l-slate-300" };
  const dot = { bad: "bg-red-500", warn: "bg-amber-500", info: "bg-slate-400" };
  return (
    <section className="rounded-lg border border-line bg-surface">
      <PanelHead title="Checks" sub="Lines that make the stock less certain — fix them in Batch inward or Batch outward and the figures follow." onClose={onClose} />
      <div className="space-y-2 p-4">
        {!checks.length ? (
          <p className="text-sm text-emerald-700">✓ Nothing to look at — every line adds up.</p>
        ) : (
          checks.map((c) => (
            <div key={c.key} className={cn("overflow-hidden rounded-md border border-l-4 border-line", tone[c.level])}>
              <button type="button" className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/40" onClick={() => setOpenK(openK === c.key ? "" : c.key)}>
                <span className={cn("h-2 w-2 flex-none rounded-full", dot[c.level])} />
                <b>{c.title}</b>
                <span className="rounded-full border border-line bg-muted px-2 text-xs font-bold">{c.rows.length}</span>
                <span className="flex-1 truncate text-xs text-ink-faint">{c.help}</span>
                <span className="text-xs text-ink-faint">{openK === c.key ? "▾" : "▸"}</span>
              </button>
              {openK === c.key && (
                <div className="max-h-80 overflow-auto border-t border-line bg-muted/20 px-3 py-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-wide text-ink-faint">
                        <th className="px-2 py-1">Material</th><th className="px-2 py-1">Batch</th><th className="px-2 py-1">Warehouse</th><th className="px-2 py-1">GRN</th><th className="px-2 py-1">Date</th><th className="px-2 py-1 text-right">Qty (kg)</th><th className="px-2 py-1">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.rows.slice(0, 200).map((r, i) => (
                        <tr key={(r.id || "") + i} className="border-t border-line/60">
                          <td className="px-2 py-1">{r.material}</td>
                          <td className="px-2 py-1 font-semibold">{r.batchNo || "—"}</td>
                          <td className="px-2 py-1">{shortLoc(r.location)}</td>
                          <td className="px-2 py-1">{r.grnNo || ""}</td>
                          <td className="px-2 py-1">{showDate(r.inwardDate || "")}</td>
                          <td className={cn("px-2 py-1 text-right tabular-nums", (r.qty ?? 0) < 0 && "text-red-600")}>{r.qty === null ? "—" : kg(r.qty)}</td>
                          <td className="px-2 py-1 text-ink-soft">{r.note || ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {c.rows.length > 200 && <p className="mt-1 text-xs text-ink-faint">First 200 of {c.rows.length} — the XLSX export has them all.</p>}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function PanelHead({ title, sub, onClose }: { title: string; sub: string; onClose: () => void }) {
  return (
    <div className="flex items-start gap-3 border-b border-line px-4 py-3">
      <div className="flex-1">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <p className="mt-0.5 text-xs text-ink-soft">{sub}</p>
      </div>
      <button type="button" className="text-ink-faint hover:text-ink" onClick={onClose} aria-label="Close">✕</button>
    </div>
  );
}

/* ---------- The ERP's stock against the warehouse's statement ---------- */
const CMP: Record<CompareStatus, [string, string]> = {
  less: ["Less in the warehouse", "bg-red-50 text-red-700"],
  more: ["More in the warehouse", "bg-amber-50 text-amber-800"],
  crmOnly: ["Not in the warehouse's stock", "bg-amber-50 text-amber-800"],
  countOnly: ["Only in the warehouse's stock", "bg-amber-50 text-amber-800"],
  named: ["Same stock, different name", "bg-emerald-50 text-emerald-700"],
  renamed: ["Batch written differently", "bg-emerald-50 text-emerald-700"],
  same: ["Matches", "bg-emerald-50 text-emerald-700"],
};
function CountPanel({ all, inward, warehouses, today, onClose }: { all: StockLine[]; inward: InwardEntry[]; warehouses: string[]; today: string; onClose: () => void }) {
  const [count, setCount] = useState<(Psv & { file: string }) | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, start] = useTransition();
  const [st, setSt] = useState<CompareStatus | "diff" | "">("diff");
  const [wh, setWh] = useState<string | null>(null);
  const [openM, setOpenM] = useState("");
  // Which warehouse the statement is for: the choice whose ERP stock is closest to its total.
  const autoWh = useMemo(() => {
    if (!count) return "";
    const opts = ["", ...warehouses].map((w) => ({ w, d: Math.abs(sum(all.filter((l) => !w || l.location === w)) - count.total) }));
    return opts.sort((a, b) => a.d - b.d)[0].w;
  }, [count, all, warehouses]);
  const where = wh ?? autoWh;
  const cmp = useMemo(() => (count ? compareStock(all.filter((l) => !where || l.location === where), count.stock, inward) : null), [all, count, where, inward]);
  const pick = (file: File) =>
    start(async () => {
      setMsg("");
      setWh(null);
      setOpenM("");
      const fd = new FormData();
      fd.set("file", file);
      const r = await readCountFile(fd);
      if (r.ok) setCount({ ...r.psv, file: r.fileName });
      else {
        setCount(null);
        setMsg(r.error);
      }
    });
  const ok = (s: CompareStatus) => s === "same" || s === "named";
  const counts = cmp ? Object.fromEntries((Object.keys(CMP) as CompareStatus[]).map((k) => [k, cmp.rows.filter((r) => r.status === k).length])) : {};
  const rows = cmp ? cmp.rows.filter((r) => (st === "diff" ? !ok(r.status) : !st || r.status === st)) : [];
  const exportXlsx = async () => {
    if (!cmp || !count) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cmp.rows.map((r) => ({ Material: r.material, "Warehouse calls it": r.countNames.join(", "), "ERP stock (kg)": r.crm, "Warehouse stock (kg)": r.counted, "Difference (kg)": r.diff, Result: CMP[r.status][0] + (r.pair ? ` (${r.pair})` : "") }))), "By material");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cmp.rows.flatMap((r) => r.batches.map((b) => ({ Material: r.material, "Batch No.": b.batchNo, "Warehouse batch": b.countBatch ?? "", "ERP stock (kg)": b.crm, "Warehouse stock (kg)": b.counted ?? "", "Difference (kg)": b.diff, Result: CMP[b.status][0] + (b.pair ? ` (${b.pair})` : "") })))), "By batch");
    XLSX.writeFile(wb, `Stock vs warehouse ${count.date || today}.xlsx`);
  };
  const diffTone = (d: number) => (d < -0.005 ? "text-red-600" : d > 0.005 ? "text-amber-700" : "");

  return (
    <section className="rounded-lg border border-line bg-surface">
      <PanelHead title="Compare with the warehouse's stock" sub="Upload the warehouse MIS (its Stock in Hand tab is read), a PSV sheet or the tracker's Instock tab. Compared on quantity per material, with the batches underneath. Nothing is saved." onClose={onClose} />
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className={buttonClass("secondary", "sm", "cursor-pointer")}>
            {busy ? "Reading…" : count ? "Choose another file" : "Choose file (.xlsx, .xls, .csv)"}
            <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) pick(file); }} />
          </label>
          {count && (
            <select className={cn(inputCls, "w-auto")} value={where} onChange={(e) => setWh(e.target.value)}>
              <option value="">Against all warehouses</option>
              {warehouses.map((w) => <option key={w} value={w}>Against {w}</option>)}
            </select>
          )}
        </div>
        {msg && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p>}
        {cmp && count && (
          <>
            <p className="text-xs text-ink-soft">
              {count.file} · “{count.sheet}” · stock {count.date ? `as of ${showDate(count.date)}` : "with no date"}.{" "}
              {count.date && count.date < today && <span className="text-amber-700">Receipts and dispatches entered after {showDate(count.date)} show as differences — and anything the warehouse has received or sent that isn&apos;t in Batch inward / outward yet.</span>}
            </p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                [`ERP stock${where ? ` · ${shortLoc(where)}` : ""}`, `${kg(Math.round(cmp.crm))} kg`, ""],
                ["Warehouse stock", `${kg(Math.round(cmp.counted))} kg`, ""],
                ["Difference", `${cmp.counted - cmp.crm > 0 ? "+" : ""}${kg(Math.round(cmp.counted - cmp.crm))} kg`, cmp.counted - cmp.crm < 0 ? "text-red-600" : ""],
                ["Materials matching", `${cmp.matched} of ${cmp.rows.length}`, ""],
              ].map(([l, v, c]) => (
                <div key={l} className="rounded-md bg-muted px-3 py-2">
                  <p className="text-xs font-semibold text-ink-faint">{l}</p>
                  <p className={cn("text-lg font-semibold tabular-nums", c)}>{v}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button type="button" className={cn("rounded-full border px-2.5 py-0.5", st === "diff" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line")} onClick={() => setSt("diff")}>With a difference <b>{cmp.rows.filter((r) => !ok(r.status)).length}</b></button>
              {(Object.keys(CMP) as CompareStatus[]).map((k) =>
                counts[k] ? (
                  <button key={k} type="button" className={cn("rounded-full border px-2.5 py-0.5", st === k ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line")} onClick={() => setSt(st === k ? "" : k)}>{CMP[k][0]} <b>{counts[k]}</b></button>
                ) : null,
              )}
              <button type="button" className={cn("rounded-full border px-2.5 py-0.5", st === "" ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line")} onClick={() => setSt("")}>All</button>
              <span className="flex-1" />
              <Button variant="secondary" size="sm" onClick={exportXlsx}>Export XLSX</Button>
            </div>
            <div className="max-h-[420px] overflow-auto rounded-md border border-line">
              <table className={sheetTable}>
                <thead>
                  <tr><th className={th}>Material</th><th className={cn(th, "text-right")}>ERP (kg)</th><th className={cn(th, "text-right")}>Warehouse (kg)</th><th className={cn(th, "text-right")}>Difference</th><th className={th}>Result</th></tr>
                </thead>
                <tbody>
                  {!rows.length ? (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-faint">Nothing here.</td></tr>
                  ) : (
                    rows.map((r) => (
                      <Fragment key={r.material}>
                        <tr className="cursor-pointer hover:bg-muted/40" onClick={() => setOpenM(openM === r.material ? "" : r.material)}>
                          <td className={td}>
                            <span className="mr-1 inline-block w-3 text-ink-faint">{openM === r.material ? "▾" : "▸"}</span><b>{r.material}</b>
                            {r.countNames.length > 0 && <span className="block pl-4 text-[11px] text-ink-faint">warehouse: {r.countNames.join(", ")}</span>}
                          </td>
                          <td className={cn(td, "text-right tabular-nums")}>{kg(r.crm)}</td>
                          <td className={cn(td, "text-right tabular-nums")}>{kg(r.counted)}</td>
                          <td className={cn(td, "text-right tabular-nums", diffTone(r.diff))}>{r.diff > 0 ? "+" : ""}{kg(r.diff)}</td>
                          <td className={td}><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", CMP[r.status][1])}>{CMP[r.status][0]}</span>{r.pair && <span className="ml-1 text-[11px] text-ink-faint">{r.pair}</span>}</td>
                        </tr>
                        {openM === r.material &&
                          r.batches.map((b, i) => (
                            <tr key={i} className="bg-muted/30 text-ink-soft">
                              <td className={cn(td, "pl-8")}>{b.batchNo || "no batch"}{b.countBatch && b.countBatch !== b.batchNo && b.crm ? <span className="block text-[11px] text-ink-faint">warehouse: {b.countBatch}</span> : null}</td>
                              <td className={cn(td, "text-right tabular-nums")}>{kg(b.crm)}</td>
                              <td className={cn(td, "text-right tabular-nums")}>{b.counted === null ? "—" : kg(b.counted)}</td>
                              <td className={cn(td, "text-right tabular-nums", diffTone(b.diff))}>{b.diff > 0 ? "+" : ""}{kg(b.diff)}</td>
                              <td className={td}><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", CMP[b.status][1])}>{CMP[b.status][0]}</span>{b.pair && <span className="ml-1 text-[11px] text-ink-faint">↔ {b.pair}</span>}</td>
                            </tr>
                          ))}
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/* ---------- Upload the latest warehouse MIS (for the daily digest's Inventory Report EOD) ---------- */
function MisPanel({ current, onClose }: { current: { fileName: string; countDate: string; uploadedAt: string; lines: number } | null; onClose: () => void }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, start] = useTransition();
  const pick = (file: File) =>
    start(async () => {
      setMsg("Reading…");
      const fd = new FormData();
      fd.set("file", file);
      const r = await uploadWarehouseMis(fd);
      setMsg(r.ok ? `Saved — ${r.message}` : r.error);
      if (r.ok) router.refresh();
    });
  return (
    <section className="rounded-lg border border-line bg-surface">
      <PanelHead title="Upload the latest warehouse MIS" sub="The warehouse's daily MIS workbook: its Stock in Hand tab (Material Description, Batch No, Qty Received, Qty Dispatched, Closing Stock) replaces the one uploaded before. The daily digest's Inventory Report EOD compares against it." onClose={onClose} />
      <div className="space-y-2 p-4 text-sm">
        <p className="text-ink-soft">
          {current ? <>Current: <b className="text-ink">{current.fileName}</b> · stock count {current.countDate ? formatDmy(current.countDate) : "with no date"} · {current.lines} lines · uploaded {formatDmy(current.uploadedAt)}</> : "None uploaded yet."}
        </p>
        <label className={buttonClass("secondary", "sm", "cursor-pointer")}>
          {busy ? "Saving…" : "Choose the warehouse MIS (.xlsx, .xls)"}
          <input type="file" accept=".xlsx,.xls,.csv" hidden disabled={busy} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) pick(file); }} />
        </label>
        {msg && <p className="text-ink">{msg}</p>}
      </div>
    </section>
  );
}

/* ---------- Plan a dispatch: which batches to take for a quantity ---------- */
function Planner({ all, warehouses }: { all: StockLine[]; warehouses: string[] }) {
  const [openP, setOpenP] = useState(false);
  const [material, setMaterial] = useState("");
  const [qty, setQty] = useState("");
  const [warehouse, setWarehouse] = useState("");
  const [rule, setRule] = useState<PickRule>("fefo");
  const [incExp, setIncExp] = useState(false);
  const [copied, setCopied] = useState(false);
  const materials = useMemo(() => [...new Set(all.filter((l) => l.instockQty > 0).map((l) => l.material))].sort(), [all]);
  const plan = useMemo(() => (material && qty ? planPick(all, { material, qty, warehouse, rule, includeExpired: incExp }) : null), [all, material, qty, warehouse, rule, incExp]);
  const copy = () => {
    if (!plan) return;
    const t = [
      `${material} — ${kg(Number(qty))} kg (${rule === "fefo" ? "earliest expiry first" : "oldest first"})`,
      ...plan.picks.map((p) => `• ${p.line.batchNo}: ${kg(p.take)} kg${p.packs !== null ? ` = ${kg(p.packs)} × ${kg(p.line.packSize)} kg` : ""} · ${shortLoc(p.line.location)}`),
      plan.short ? `Short by ${kg(plan.short)} kg` : "",
    ].filter(Boolean).join("\n");
    navigator.clipboard?.writeText(t).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  };
  return (
    <section className="rounded-lg border border-line bg-surface px-4 py-2">
      <button type="button" className="w-full py-1 text-left text-sm" onClick={() => setOpenP(!openP)}>
        <b>{openP ? "▾" : "▸"} Plan a dispatch</b> <span className="text-ink-faint">— which batches to take for a quantity, and how many packs</span>
      </button>
      {openP && (
        <div className="pb-3">
          <div className="mt-2 grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="block text-xs font-medium text-ink-soft lg:col-span-2"><span className="mb-1 block">Material</span><input className={inputCls} list="sih-mats" value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="AG Catalogue Name" /><datalist id="sih-mats">{materials.map((m) => <option key={m} value={m} />)}</datalist></label>
            <label className="block text-xs font-medium text-ink-soft"><span className="mb-1 block">Quantity (kg)</span><input className={inputCls} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
            <label className="block text-xs font-medium text-ink-soft"><span className="mb-1 block">Warehouse</span><select className={inputCls} value={warehouse} onChange={(e) => setWarehouse(e.target.value)}><option value="">Any</option>{warehouses.map((w) => <option key={w}>{w}</option>)}</select></label>
            <label className="block text-xs font-medium text-ink-soft"><span className="mb-1 block">Take first</span><select className={inputCls} value={rule} onChange={(e) => setRule(e.target.value as PickRule)}><option value="fefo">Earliest expiry (FEFO)</option><option value="fifo">Oldest inward (FIFO)</option></select></label>
            <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={incExp} onChange={(e) => setIncExp(e.target.checked)} /> Include expired</label>
          </div>
          {plan && (
            <div className="mt-3 text-sm">
              <p>
                <b>{kg(plan.available)} kg</b> of {material} available{warehouse ? ` at ${shortLoc(warehouse)}` : ""}.{" "}
                {plan.short ? <span className="font-semibold text-red-600">Short by {kg(plan.short)} kg.</span> : <span className="font-semibold text-emerald-700">Covered by {plan.picks.length} batch{plan.picks.length > 1 ? "es" : ""}.</span>}
              </p>
              {plan.picks.length > 0 && (
                <>
                  <div className="mt-2 overflow-x-auto rounded-md border border-line">
                    <table className={sheetTable}>
                      <thead><tr><th className={th}>Batch</th><th className={th}>Warehouse</th><th className={cn(th, "text-right")}>Take (kg)</th><th className={cn(th, "text-right")}>Packs</th><th className={cn(th, "text-right")}>Left after</th><th className={th}>Exp</th><th className={th}>Inward</th><th className={th}>GRN</th></tr></thead>
                      <tbody>
                        {plan.picks.map((p) => (
                          <tr key={p.line.id}>
                            <td className={cn(td, "font-semibold")}>{p.line.batchNo}</td>
                            <td className={td}>{shortLoc(p.line.location)}</td>
                            <td className={cn(td, "text-right tabular-nums")}>{kg(p.take)}</td>
                            <td className={cn(td, "text-right tabular-nums")}>{p.packs === null ? "—" : `${kg(p.packs)} × ${kg(p.line.packSize)} kg`}</td>
                            <td className={cn(td, "text-right tabular-nums")}>{kg(Math.round((p.line.instockQty - p.take) * 1000) / 1000)}</td>
                            <td className={td}>{p.line.expIso ? showDate(p.line.expIso) : p.line.expDate || "—"}</td>
                            <td className={td}>{showDate(p.line.inwardDate)}</td>
                            <td className={td}>{p.line.grnNo}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Button variant="secondary" size="sm" className="mt-2" onClick={copy}>{copied ? "Copied" : "Copy the plan"}</Button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
