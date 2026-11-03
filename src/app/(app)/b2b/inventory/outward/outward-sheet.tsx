"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  LOCATIONS,
  OUTWARD_FIELDS,
  OUT_FUNNELS,
  batchKey,
  checkBatches,
  num,
  r3,
  sheetDifferences,
  shortLoc,
  showDate,
  type BatchInStock,
  type InwardEntry,
  type OutwardEntry,
} from "@/lib/batch-inventory";
import { History, ImportDialog, Modal, Tile, inputCls, kg, sheetTable, stickyCol, td, th } from "../_components/kit";
import { filterOutward, inwardRows, type OutwardRow } from "../_lib/filters";
import type { JobRef } from "../_lib/types";
import { createOutward, deleteOutward, importOutward, previewOutwardImport, updateOutward } from "./actions";

const F = Object.fromEntries(OUTWARD_FIELDS.map((f) => [f.key, f]));
const COMMON = ["jobNo", "obDate", "warehouse", "funnel", "customer", "saleRate"] as const;
const LINE = ["batchNo", "qty", "productName", "catalogueName", "grnNo"] as const;
type CommonKey = (typeof COMMON)[number];
type LineKey = (typeof LINE)[number];
type Line = Record<LineKey, string>;
type Form = { id?: string; source?: string; common: Record<CommonKey, string>; lines: Line[]; was?: { batch: string; qty: number } };
type BatchStock = { batchNo: string; productName: string; catalogueName: string; grnNo: string; location: string; stock: number };

const PAGE = 300;
const blankLine = (): Line => ({ batchNo: "", qty: "", productName: "", catalogueName: "", grnNo: "" });
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export function OutwardSheet({
  inward,
  outward,
  customers,
  jobs,
  today,
  canEdit,
  isAdmin,
  initialQ,
}: {
  inward: (InwardEntry & { id: string })[];
  outward: OutwardRow[];
  customers: string[];
  jobs: JobRef[];
  today: string;
  canEdit: boolean;
  isAdmin: boolean;
  initialQ: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ);
  const [wh, setWh] = useState("");
  const [src, setSrc] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [form, setForm] = useState<Form | null>(null);
  const [importing, setImporting] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [err, setErr] = useState("");
  const [, start] = useTransition();

  // Stock per batch after every dispatch (sheet figure + lines entered here).
  const byBatch = useMemo(() => {
    const m = new Map<string, BatchStock>();
    for (const r of inwardRows(inward, outward, today)) {
      const k = batchKey(r.batchNo);
      if (!k) continue;
      const o = m.get(k) || { batchNo: r.batchNo, productName: r.productName, catalogueName: r.catalogueName, grnNo: r.grnNo, location: r.location, stock: 0 };
      o.stock += r.instockQty || 0;
      m.set(k, o);
    }
    return m;
  }, [inward, outward, today]);
  const diffs = useMemo(() => sheetDifferences(inward, outward), [inward, outward]);
  const filtered = useMemo(() => filterOutward(outward, { q, wh, src }), [outward, q, wh, src]);
  const warehouses = useMemo(() => [...new Set([...LOCATIONS, ...outward.map((r) => r.warehouse).filter(Boolean)])], [outward]);
  const month = today.slice(0, 7);
  const thisMonth = outward.filter((r) => r.obDate.startsWith(month));
  const crm = outward.filter((r) => r.source === "crm");
  const lastDate = outward.map((r) => r.obDate).filter((d) => d && d <= today).sort().pop();
  const sumKg = (rs: OutwardRow[]) => rs.reduce((a, r) => a + (num(r.qty) || 0), 0);

  const openNew = () => setForm({ common: { jobNo: "", obDate: today, warehouse: LOCATIONS[0], funnel: OUT_FUNNELS[0], customer: "", saleRate: "" }, lines: [blankLine()] });
  const openEdit = (r: OutwardRow) => {
    if (!canEdit) return;
    setForm({
      id: r.id,
      source: r.source,
      common: Object.fromEntries(COMMON.map((k) => [k, str(r[k])])) as Record<CommonKey, string>,
      lines: [Object.fromEntries(LINE.map((k) => [k, str(r[k])])) as Line],
      was: { batch: batchKey(r.batchNo), qty: r.source === "crm" ? num(r.qty) || 0 : 0 },
    });
  };
  const remove = (r: OutwardRow) => {
    if (!window.confirm(`Delete this outward line?\n\n${r.productName} · ${r.batchNo || "no batch"} · ${kg(r.qty)} kg to ${r.customer || "—"}${r.source === "crm" ? "\n\nIts quantity goes back into the batch's stock." : ""}`)) return;
    start(async () => {
      const res = await deleteOutward(r.id);
      if (!res.ok) setErr(res.error);
      else router.refresh();
    });
  };
  const exportHref = `/b2b/inventory/outward/export?${new URLSearchParams({ q, wh, src })}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Outward lines" value={outward.length.toLocaleString("en-IN")} hint={`last dispatch ${lastDate ? showDate(lastDate) : "—"}`} />
        <Tile label="kg dispatched this month" value={kg(Math.round(sumKg(thisMonth)))} hint={`${thisMonth.length} lines`} />
        <Tile label="Entered in the ERP" value={crm.length} hint={`${kg(Math.round(sumKg(crm)))} kg taken off stock`} />
        <Tile
          label="Batches to reconcile"
          value={diffs.length}
          tone={diffs.length ? "warning" : "default"}
          active={showDiff}
          onClick={() => setShowDiff(!showDiff)}
          hint={diffs.length ? `${kg(Math.round(diffs.reduce((a, d) => a + d.diff, 0)))} kg · click to ${showDiff ? "hide" : "see"}` : "the two sheets agree"}
        />
      </div>

      {showDiff && diffs.length > 0 && (
        <div className="rounded-lg border border-line bg-surface">
          <div className="border-b border-line px-4 py-3">
            <h3 className="text-sm font-semibold text-ink">Batches to reconcile</h3>
            <p className="mt-0.5 text-xs text-ink-soft">
              The Inward sheet&apos;s Outward Qty ≠ the outward lines imported from the sheet. Stock follows the Inward sheet. Moves between our warehouses (an Inward line whose Supplier is one of our warehouses) count as accounted for — what&apos;s left is unexplained: add the missing outward lines, or correct the Inward line.
            </p>
          </div>
          <div className="max-h-96 overflow-auto">
            <table className={sheetTable}>
              <thead>
                <tr>
                  <th className={th}>Batch</th><th className={th}>Product</th><th className={cn(th, "text-right")}>Inward sheet&apos;s Outward Qty</th><th className={cn(th, "text-right")}>Outward lines</th><th className={cn(th, "text-right")}>Moved between warehouses</th><th className={cn(th, "text-right")}>Unexplained</th>
                </tr>
              </thead>
              <tbody>
                {diffs.map((d) => (
                  <tr key={d.batchNo + d.productName}>
                    <td className={cn(td, "font-semibold")}>{d.batchNo}</td>
                    <td className={td}>{d.productName}</td>
                    <td className={cn(td, "text-right tabular-nums")}>{kg(d.inwardOutward)}</td>
                    <td className={cn(td, "text-right tabular-nums")}>{kg(d.outwardLines)}</td>
                    <td className={cn(td, "text-right tabular-nums")} title={d.transfers.map((t) => `GRN ${t.grnNo} ${showDate(t.date)}: ${kg(t.qty)} kg ${shortLoc(t.from)} → ${shortLoc(t.to)}`).join("\n")}>{d.transferred ? kg(d.transferred) : "—"}</td>
                    <td className={cn(td, "text-right font-semibold tabular-nums", d.diff > 0 ? "text-amber-700" : "text-red-600")}>{d.diff > 0 ? "+" : ""}{kg(d.diff)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input className={cn(inputCls, "w-72")} type="search" placeholder="Search job, customer, product, batch, GRN…" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} />
        <select className={cn(inputCls, "w-auto")} value={wh} onChange={(e) => { setWh(e.target.value); setShown(PAGE); }}>
          <option value="">All warehouses</option>
          {warehouses.map((l) => <option key={l}>{l}</option>)}
        </select>
        <select className={cn(inputCls, "w-auto")} value={src} onChange={(e) => { setSrc(e.target.value); setShown(PAGE); }}>
          <option value="">From the sheet and the ERP</option>
          <option value="sheet">From the old sheet</option>
          <option value="crm">Entered in the ERP</option>
        </select>
        <span className="flex-1" />
        <a className={buttonClass("secondary", "sm")} href={exportHref}>Export XLSX</a>
        {canEdit && <Button variant="secondary" size="sm" onClick={() => setImporting(true)}>Import sheet</Button>}
        {canEdit && <Button size="sm" onClick={openNew}>+ New outward</Button>}
      </div>
      {err && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      <div className="max-h-[70vh] overflow-auto rounded-lg border border-line bg-surface">
        <table className={sheetTable}>
          <thead>
            <tr>
              {OUTWARD_FIELDS.map((f, i) => <th key={f.key} className={cn(th, f.kind === "num" && "text-right", i === 0 && "left-0 z-20")}>{f.short || f.label}</th>)}
              <th className={th}>Source</th>
              {canEdit && <th className={th} />}
            </tr>
          </thead>
          <tbody>
            {!filtered.length ? (
              <tr><td colSpan={OUTWARD_FIELDS.length + 2} className="px-4 py-10 text-center text-sm text-ink-faint">{outward.length ? "Nothing matches." : "No outward lines yet — add one, or import the outward sheet."}</td></tr>
            ) : (
              filtered.slice(0, shown).map((r) => (
                <tr key={r.id} className={cn("hover:bg-muted/40", canEdit && "cursor-pointer")} onDoubleClick={() => openEdit(r)}>
                  {OUTWARD_FIELDS.map((f, i) => (
                    <td key={f.key} className={cn(td, f.kind === "num" && "text-right tabular-nums", i === 0 && stickyCol)}>
                      {f.key === "obDate" ? showDate(r.obDate) : f.kind === "num" ? kg(r[f.key] as number | null) : str(r[f.key])}
                    </td>
                  ))}
                  <td className={td}><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", r.source === "crm" ? "bg-emerald-50 text-emerald-700" : "bg-muted text-ink-soft")}>{r.source === "crm" ? "ERP" : "Sheet"}</span></td>
                  {canEdit && (
                    <td className={cn(td, "space-x-1")}>
                      <button type="button" className="text-brand-700 hover:underline" onClick={() => openEdit(r)}>Edit</button>
                      <button type="button" className="text-red-600 hover:underline" onClick={() => remove(r)} aria-label="Delete">✕</button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs text-ink-soft">
        <span>{filtered.length.toLocaleString("en-IN")} lines{filtered.length > shown ? ` · showing ${shown}` : ""}{canEdit ? " · double-click a line to edit" : ""}</span>
        {filtered.length > shown && <Button variant="secondary" size="sm" onClick={() => setShown(shown + PAGE)}>Show more</Button>}
      </div>

      {form && (
        <DispatchForm
          form={form}
          setForm={setForm}
          byBatch={byBatch}
          customers={[...new Set([...customers, ...outward.map((r) => r.customer).filter(Boolean)])].sort()}
          jobs={jobs}
          warehouses={warehouses}
          onDone={() => { setForm(null); router.refresh(); }}
        />
      )}
      {importing && (
        <ImportDialog<OutwardEntry>
          title="Import the outward sheet"
          hint="The inventory tracker's “Outward” sheet as CSV or Excel. These lines are already in the Inward sheet's Outward Qty, so they don't move stock again."
          isAdmin={isAdmin}
          hasRows={outward.some((r) => r.source === "sheet")}
          replaceLabel="Replace the lines imported earlier (lines entered in the ERP stay)"
          preview={previewOutwardImport}
          commit={importOutward as (i: { mode: "add" | "replace"; fileName: string; entries: OutwardEntry[] }) => ReturnType<typeof importOutward>}
          onClose={() => setImporting(false)}
        />
      )}
    </div>
  );
}

/* ---------- new dispatch / edit a line ---------- */
function DispatchForm({
  form,
  setForm,
  byBatch,
  customers,
  jobs,
  warehouses,
  onDone,
}: {
  form: Form;
  setForm: (f: Form | null | ((f: Form | null) => Form | null)) => void;
  byBatch: Map<string, BatchStock>;
  customers: string[];
  jobs: JobRef[];
  warehouses: string[];
  onDone: () => void;
}) {
  const [msg, setMsg] = useState("");
  const [saving, start] = useTransition();
  const editing = !!form.id;
  const c = form.common;
  const update = (fn: (f: Form) => Form) => setForm((f) => (f ? fn(f) : f));
  const setC = (k: CommonKey, v: string) => update((f) => ({ ...f, common: { ...f.common, [k]: v } }));
  const setL = (i: number, k: LineKey, v: string) =>
    update((f) => ({
      ...f,
      lines: f.lines.map((l, j) => {
        if (j !== i) return l;
        const n = { ...l, [k]: v };
        // A batch fills its product, catalogue name and GRN from the Inward line.
        if (k === "batchNo") {
          const b = byBatch.get(batchKey(v));
          if (b) Object.assign(n, { productName: b.productName || n.productName, catalogueName: b.catalogueName || n.catalogueName, grnNo: b.grnNo || n.grnNo });
        }
        return n;
      }),
    }));
  // Batches with stock in the chosen warehouse, for the pick-list.
  const options = useMemo(
    () => [...byBatch.values()].filter((b) => b.stock > 0.0005 && (!c.warehouse || b.location === c.warehouse)).sort((a, b) => a.productName.localeCompare(b.productName)),
    [byBatch, c.warehouse],
  );
  // Batches with stock, for "did you mean" when a typed batch isn't one of them.
  const inStock: BatchInStock[] = useMemo(
    () => [...byBatch.values()].filter((b) => b.stock > 0.0005).map((b) => ({ batchNo: b.batchNo, key: batchKey(b.batchNo), material: b.catalogueName || b.productName, productName: b.productName, locations: [b.location], stock: r3(b.stock) })),
    [byBatch],
  );
  const nearOf = (l: Line) => (l.batchNo ? checkBatches(l.batchNo, l.catalogueName || l.productName, inStock)[0]?.suggestion ?? null : null);
  // Stock left in a batch for this form (an edited ERP line's own quantity is added back).
  const avail = (l: Line) => {
    const b = byBatch.get(batchKey(l.batchNo));
    if (!b) return null;
    return b.stock + (editing && form.was?.batch === batchKey(l.batchNo) ? form.was.qty : 0);
  };
  const used = (i: number) => form.lines.reduce((a, l, j) => (j < i && batchKey(l.batchNo) === batchKey(form.lines[i].batchNo) ? a + (num(l.qty) || 0) : a), 0);

  const fromJob = () => {
    const j = jobs.find((x) => String(x.jobNo) === c.jobNo.trim());
    if (!j) {
      setMsg(c.jobNo ? `Job ${c.jobNo} isn't in Domestic MIS — fill the details by hand.` : "");
      return;
    }
    update((f) => {
      const common = { ...f.common };
      if (!common.customer) common.customer = j.customer;
      let lines = f.lines;
      const bs = j.batchNo.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
      if (!editing && bs.length && lines.length === 1 && !lines[0].batchNo) {
        lines = bs.map((b) => {
          const m = byBatch.get(batchKey(b));
          return { ...blankLine(), batchNo: b, qty: bs.length === 1 ? j.quantityKgs : "", productName: m?.productName || j.productName, catalogueName: m?.catalogueName || "", grnNo: m?.grnNo || "" };
        });
      } else if (!editing && lines.length === 1 && !lines[0].productName) lines = [{ ...lines[0], productName: j.productName, qty: lines[0].qty || j.quantityKgs }];
      return { ...f, common, lines };
    });
    setMsg(`Filled from Domestic MIS job ${j.jobNo}: ${j.productName || ""} to ${j.customer || "—"}.`);
  };

  const total = form.lines.reduce((a, l) => a + (num(l.qty) || 0), 0);
  const save = () => {
    if (!c.obDate) return setMsg("Enter the OB date.");
    const bad = form.lines.findIndex((l) => num(l.qty) === null || !l.batchNo);
    if (bad >= 0) return setMsg(`Enter the batch and quantity for line ${bad + 1}.`);
    if (form.source !== "sheet") {
      const over = form.lines.map((l, i) => ({ l, i, a: avail(l) })).filter(({ l, i, a }) => a !== null && (num(l.qty) || 0) + used(i) > a + 0.0005);
      if (over.length && !window.confirm(`${over.map(({ l, a }) => `${l.batchNo}: ${kg(num(l.qty))} kg but ${kg(Math.max(0, a ?? 0))} kg in stock`).join("\n")}\n\nSave anyway? The batch will show negative stock.`)) return;
      const unknown = form.lines.filter((l) => !byBatch.has(batchKey(l.batchNo)));
      if (unknown.length && !window.confirm(`${unknown.map((l) => l.batchNo).join(", ")} ${unknown.length > 1 ? "aren't" : "isn't"} on the Inward page, so it can't come off any stock.\n\nSave anyway?`)) return;
    }
    setMsg("");
    start(async () => {
      const list = form.lines.map((l) => ({ ...c, ...l }));
      const r = form.id ? await updateOutward(form.id, list[0]) : await createOutward(list);
      if (!r.ok) setMsg("Not saved: " + r.error);
      else onDone();
    });
  };

  const field = (k: CommonKey, el: ReactNode) => (
    <label key={k} className="block text-xs font-medium text-ink-soft">
      <span className="mb-1 block">{F[k].short || F[k].label}</span>
      {el}
    </label>
  );

  return (
    <Modal
      wide
      title={editing ? `Edit outward line${form.source === "sheet" ? " (from the old sheet)" : ""}` : "New outward"}
      onClose={() => !saving && setForm(null)}
      footer={
        <>
          {msg && <span className="mr-auto text-sm text-ink">{msg}</span>}
          <Button variant="secondary" onClick={() => setForm(null)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : `Save ${form.lines.length} line${form.lines.length > 1 ? "s" : ""}`}</Button>
        </>
      }
    >
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Dispatch</h4>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {field("jobNo", <><input className={inputCls} list="ow-jobs" value={c.jobNo} onChange={(e) => setC("jobNo", e.target.value)} onBlur={fromJob} /><datalist id="ow-jobs">{jobs.slice(0, 500).map((j) => <option key={j.jobNo} value={j.jobNo} />)}</datalist></>)}
        {field("obDate", <input className={inputCls} type="date" value={c.obDate} onChange={(e) => setC("obDate", e.target.value)} />)}
        {field("warehouse", <select className={inputCls} value={c.warehouse} onChange={(e) => setC("warehouse", e.target.value)}>{[...new Set([...warehouses, c.warehouse].filter(Boolean))].map((o) => <option key={o}>{o}</option>)}</select>)}
        {field("funnel", <select className={inputCls} value={c.funnel} onChange={(e) => setC("funnel", e.target.value)}>{[...new Set([...OUT_FUNNELS, c.funnel].filter(Boolean))].map((o) => <option key={o}>{o}</option>)}</select>)}
        {field("customer", <><input className={inputCls} list="ow-customers" value={c.customer} onChange={(e) => setC("customer", e.target.value)} /><datalist id="ow-customers">{customers.map((o) => <option key={o} value={o} />)}</datalist></>)}
        {field("saleRate", <input className={inputCls} inputMode="decimal" value={c.saleRate} onChange={(e) => setC("saleRate", e.target.value)} />)}
      </div>

      <h4 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-ink-faint">{editing ? "Batch" : `Batches · ${form.lines.length} · ${kg(total)} kg`}</h4>
      <div className="overflow-x-auto">
        <table className="min-w-[860px] text-xs">
          <thead>
            <tr>
              {["Batch No.", "Qty (kg)", "Product Name", "AG Catalogue Name", "GRN No."].map((h) => <th key={h} className="px-1 pb-1 text-left font-semibold text-ink-soft">{h}</th>)}
              {!editing && <th />}
            </tr>
          </thead>
          <tbody>
            {form.lines.map((l, i) => {
              const a = avail(l);
              const left = a === null ? null : a - used(i) - (num(l.qty) || 0);
              const near = a === null ? nearOf(l) : null;
              return (
                <tr key={i} className="align-top">
                  <td className="w-64 px-1 py-0.5">
                    <input className={inputCls} list="ow-batches" value={l.batchNo} onChange={(e) => setL(i, "batchNo", e.target.value)} placeholder="Pick a batch in stock" />
                    <div className={cn("mt-0.5 text-[11px]", left !== null && left < -0.0005 ? "font-semibold text-red-600" : "text-ink-faint")}>
                      {!l.batchNo ? "" : a === null ? (
                        near ? (
                          <>
                            Not on the Inward page — did you mean <b>{near.batchNo}</b>?{" "}
                            <button type="button" className="rounded-full border border-current px-2 text-[11px]" onClick={() => setL(i, "batchNo", near.batchNo)}>Use it</button>
                          </>
                        ) : (
                          "Not on the Inward page"
                        )
                      ) : (
                        `${kg(r3(Math.max(0, a - used(i))))} kg in stock${left !== null && left < -0.0005 ? ` — ${kg(r3(-left))} kg short` : ""}`
                      )}
                    </div>
                  </td>
                  <td className="w-28 px-1 py-0.5"><input className={inputCls} inputMode="decimal" value={l.qty} onChange={(e) => setL(i, "qty", e.target.value)} /></td>
                  <td className="px-1 py-0.5"><input className={inputCls} value={l.productName} onChange={(e) => setL(i, "productName", e.target.value)} /></td>
                  <td className="px-1 py-0.5"><input className={inputCls} value={l.catalogueName} onChange={(e) => setL(i, "catalogueName", e.target.value)} /></td>
                  <td className="w-24 px-1 py-0.5"><input className={inputCls} value={l.grnNo} onChange={(e) => setL(i, "grnNo", e.target.value)} /></td>
                  {!editing && (
                    <td className="px-1 pt-1.5">
                      <button type="button" className="text-ink-faint hover:text-red-600 disabled:opacity-30" title="Remove line" disabled={form.lines.length < 2} onClick={() => update((f) => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }))}>✕</button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        <datalist id="ow-batches">{options.map((b) => <option key={b.batchNo} value={b.batchNo}>{`${b.productName} · ${kg(r3(b.stock))} kg · ${shortLoc(b.location)}`}</option>)}</datalist>
      </div>
      {!editing && <div className="mt-2"><Button variant="secondary" size="sm" onClick={() => update((f) => ({ ...f, lines: [...f.lines, blankLine()] }))}>+ Add batch</Button></div>}
      <p className="mt-3 text-xs text-ink-faint">
        {form.source === "sheet" ? "This line came from the old sheet, so it is already in the Inward sheet's Outward Qty; editing it doesn't move stock." : "Saving takes these quantities off the batches' stock."}
      </p>
      {form.id && <History entityType="BatchOutward" id={form.id} />}
    </Modal>
  );
}
