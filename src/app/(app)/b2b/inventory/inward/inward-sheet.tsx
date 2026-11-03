"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { FUNNELS, INWARD_FIELDS, LICENSES, LOCATIONS, UOMS, nextGrn, num, shortLoc, showDate, type InwardEntry } from "@/lib/batch-inventory";
import { History, ImportDialog, Modal, Tile, inputCls, kg, sheetTable, stickyCol, td, th } from "../_components/kit";
import { filterInward, inwardRows, type InwardRow, type OutwardLite } from "../_lib/filters";
import type { JobRef, Masters } from "../_lib/types";
import { createInward, deleteInward, importInward, previewInwardImport, updateInward } from "./actions";

type Entry = InwardEntry & { id: string };
const COMMON = ["jobNo", "inwardDate", "location", "funnel", "supplyPoc", "grnNo", "manufacturer", "supplier", "productName", "catalogueName", "type", "hsn", "purchaseRate", "license", "remarks"] as const;
const BATCH = ["batchNo", "units", "packaging", "uom", "netWeight", "grossWeight", "mfgDate", "expDate"] as const;
type CommonKey = (typeof COMMON)[number];
type BatchKey = (typeof BATCH)[number];
type Common = Record<CommonKey, string>;
type BatchRow = Record<BatchKey, string> & { outwardQty?: string };
type Form = { id?: string; common: Common; batches: BatchRow[]; crmOut?: number };

const F = Object.fromEntries(INWARD_FIELDS.map((f) => [f.key, f]));
const PAGE = 300;
const blankBatch = (): BatchRow => ({ batchNo: "", units: "", packaging: "", uom: "kg", netWeight: "", grossWeight: "", mfgDate: "", expDate: "" });
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const dmyOrRaw = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? showDate(v) : v);

export function InwardSheet({
  inward,
  outward,
  masters,
  jobs,
  today,
  canEdit,
  isAdmin,
  initialQ,
}: {
  inward: Entry[];
  outward: OutwardLite[];
  masters: Masters;
  jobs: JobRef[];
  today: string;
  canEdit: boolean;
  isAdmin: boolean;
  initialQ: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ);
  const [loc, setLoc] = useState("");
  const [inStock, setInStock] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [form, setForm] = useState<Form | null>(null);
  const [importing, setImporting] = useState(false);
  const [err, setErr] = useState("");
  const [, start] = useTransition();

  const all = useMemo(() => inwardRows(inward, outward, today), [inward, outward, today]);
  const filtered = useMemo(() => filterInward(all, { q, loc, stock: inStock }), [all, q, loc, inStock]);
  const locations = useMemo(() => [...new Set([...LOCATIONS, ...all.map((r) => r.location).filter(Boolean)])], [all]);
  const stock = all.filter((r) => (r.instockQty ?? 0) > 0.0005);
  const crmOut = all.filter((r) => r.crmOutwardQty).length;
  const lastDate = all.map((r) => r.inwardDate).filter((d) => d && d <= today).sort().pop();
  const futureDated = all.filter((r) => r.inwardDate && r.inwardDate > today).length;
  const old = stock.filter((r) => (r.ageing ?? 0) > 180).length;

  const opts = useMemo(() => {
    const u = (k: keyof InwardEntry) => [...new Set(all.map((r) => str(r[k])).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return {
      supplyPoc: [...new Set([...masters.pocs, ...u("supplyPoc")])].sort(),
      supplier: [...new Set([...masters.suppliers, ...u("supplier")])].sort(),
      manufacturer: u("manufacturer"),
      productName: [...new Set([...masters.products.map((p) => p.name), ...u("productName")])].sort(),
      catalogueName: [...new Set([...u("catalogueName"), ...masters.products.map((p) => p.name)])].sort(),
      packaging: u("packaging").filter((p) => p.length < 40),
      jobNo: jobs.map((j) => j.jobNo).filter(Boolean).slice(0, 500),
    } as Record<string, string[]>;
  }, [all, masters, jobs]);

  const openNew = () =>
    setForm({
      common: { jobNo: "", inwardDate: today, location: LOCATIONS[0], funnel: FUNNELS[0], supplyPoc: "", grnNo: nextGrn(all, LOCATIONS[0]), manufacturer: "", supplier: "", productName: "", catalogueName: "", type: "", hsn: "", purchaseRate: "", license: "", remarks: "" },
      batches: [blankBatch()],
    });
  const openEdit = (r: InwardRow) => {
    if (!canEdit) return;
    setForm({
      id: r.id,
      common: Object.fromEntries(COMMON.map((k) => [k, str(r[k])])) as Common,
      batches: [{ ...(Object.fromEntries(BATCH.map((k) => [k, k === "mfgDate" || k === "expDate" ? dmyOrRaw(str(r[k])) : str(r[k])])) as Record<BatchKey, string>), outwardQty: str(r.crmOutwardQty ? r.sheetOutwardQty : r.outwardQty) }],
      crmOut: r.crmOutwardQty || 0,
    });
  };
  const remove = (r: InwardRow) => {
    if (!window.confirm(`Delete this inward line?\n\n${r.productName} · ${r.batchNo || "no batch"} · ${kg(r.netWeight)} kg`)) return;
    start(async () => {
      const res = await deleteInward(r.id);
      if (!res.ok) setErr(res.error);
      else router.refresh();
    });
  };
  const exportHref = `/b2b/inventory/inward/export?${new URLSearchParams({ q, loc, stock: inStock ? "1" : "" })}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Inward lines" value={all.length.toLocaleString("en-IN")} hint={<>last inward {lastDate ? showDate(lastDate) : "—"}{futureDated ? <b className="text-amber-700"> · {futureDated} dated in the future</b> : null}</>} />
        <Tile label="Lines with stock" value={stock.length.toLocaleString("en-IN")} hint={`batches not fully dispatched${crmOut ? ` · ${crmOut} with ERP dispatches` : ""}`} />
        <Tile
          label="In stock (kg)"
          value={kg(Math.round(stock.reduce((a, r) => a + (r.instockQty ?? 0), 0)))}
          hint={locations.map((l) => { const v = stock.filter((r) => r.location === l).reduce((a, r) => a + (r.instockQty ?? 0), 0); return v ? `${shortLoc(l)} ${kg(Math.round(v))}` : null; }).filter(Boolean).join(" · ") || "—"}
        />
        <Tile label="Older than 180 days" value={old} hint="lines still in stock" tone={old ? "warning" : "default"} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input className={cn(inputCls, "w-72")} type="search" placeholder="Search job, GRN, product, batch, supplier…" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} />
        <select className={cn(inputCls, "w-auto")} value={loc} onChange={(e) => { setLoc(e.target.value); setShown(PAGE); }}>
          <option value="">All locations</option>
          {locations.map((l) => <option key={l}>{l}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-ink"><input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} /> Only lines with stock</label>
        <span className="flex-1" />
        <a className={buttonClass("secondary", "sm")} href={exportHref}>Export XLSX</a>
        {canEdit && <Button variant="secondary" size="sm" onClick={() => setImporting(true)}>Import sheet</Button>}
        {canEdit && <Button size="sm" onClick={openNew}>+ New inward</Button>}
      </div>
      {err && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      <div className="max-h-[70vh] overflow-auto rounded-lg border border-line bg-surface">
        <table className={sheetTable}>
          <thead>
            <tr>
              {INWARD_FIELDS.map((f, i) => <th key={f.key} className={cn(th, (f.kind === "num" || f.kind === "calc") && "text-right", i === 0 && "left-0 z-20")}>{f.short || f.label}</th>)}
              {canEdit && <th className={th} />}
            </tr>
          </thead>
          <tbody>
            {!filtered.length ? (
              <tr><td colSpan={INWARD_FIELDS.length + 1} className="px-4 py-10 text-center text-sm text-ink-faint">{all.length ? "Nothing matches." : "No inward lines yet — add one, or import the inward sheet."}</td></tr>
            ) : (
              filtered.slice(0, shown).map((r) => (
                <tr key={r.id} className={cn("hover:bg-muted/40", canEdit && "cursor-pointer")} onDoubleClick={() => openEdit(r)}>
                  {INWARD_FIELDS.map((f, i) => <td key={f.key} className={cn(td, cellClass(f.key, f.kind, r), i === 0 && stickyCol)} title={f.key === "packaging" || f.key === "remarks" ? str(r[f.key as keyof InwardRow]) || undefined : undefined}>{cellText(f.key, f.kind, r)}</td>)}
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

      {form && <EntryForm form={form} setForm={setForm} opts={opts} all={all} jobs={jobs} masters={masters} locations={locations} onDone={() => { setForm(null); router.refresh(); }} />}
      {importing && (
        <ImportDialog<InwardEntry>
          title="Import the inward sheet"
          hint="The inventory tracker's “Inward” sheet as CSV or Excel. Columns are matched by their headers; Instock Qty and Ageing are worked out again."
          isAdmin={isAdmin}
          hasRows={all.length > 0}
          replaceLabel="Replace all Inward lines with this sheet"
          preview={previewInwardImport}
          commit={importInward as (i: { mode: "add" | "replace"; fileName: string; entries: InwardEntry[] }) => ReturnType<typeof importInward>}
          onClose={() => setImporting(false)}
        />
      )}
    </div>
  );
}

function cellText(key: string, kind: string | undefined, r: InwardRow) {
  const v = (r as unknown as Record<string, unknown>)[key];
  if (key === "inwardDate" || key === "mfgDate" || key === "expDate") return showDate(str(v));
  if (key === "ageing") return v === null ? "N/A" : str(v);
  if (kind === "num" || kind === "calc") return kg(v as number | null);
  if (key === "packaging" || key === "remarks") return str(v).split(/\n+/).map((s) => s.trim()).filter(Boolean).join(" · ");
  return str(v);
}
function cellClass(key: string, kind: string | undefined, r: InwardRow) {
  const c: string[] = [kind === "num" || kind === "calc" ? "text-right tabular-nums" : ""];
  if (key === "instockQty") c.push((r.instockQty ?? 0) < -0.0005 ? "font-semibold text-red-600" : (r.instockQty ?? 0) > 0.0005 ? "font-semibold text-emerald-700" : "text-ink-faint");
  if (key === "ageing" && (r.ageing ?? 0) > 180) c.push("text-amber-700 font-semibold");
  if (key === "packaging" || key === "remarks") c.push("max-w-56 truncate");
  if (key === "outwardQty" && r.crmOutwardQty) c.push("text-brand-700");
  return c.join(" ");
}

/* ---------- new receipt / edit a line ---------- */
function EntryForm({
  form,
  setForm,
  opts,
  all,
  jobs,
  masters,
  locations,
  onDone,
}: {
  form: Form;
  setForm: (f: Form | null | ((f: Form | null) => Form | null)) => void;
  opts: Record<string, string[]>;
  all: InwardRow[];
  jobs: JobRef[];
  masters: Masters;
  locations: string[];
  onDone: () => void;
}) {
  const [msg, setMsg] = useState("");
  const [saving, start] = useTransition();
  const editing = !!form.id;
  const c = form.common;
  const update = (fn: (f: Form) => Form) => setForm((f) => (f ? fn(f) : f));
  const setC = (k: CommonKey, v: string) =>
    update((f) => {
      const common = { ...f.common, [k]: v };
      if (k === "location" && !editing) common.grnNo = nextGrn(all, v);
      // Catalogue name → Type, HSN and licence as last used for it (else the Product master).
      if (k === "catalogueName") {
        const prev = all.find((r) => r.catalogueName === v);
        const pm = masters.products.find((p) => p.name === v);
        if (prev) Object.assign(common, { type: prev.type || common.type, hsn: prev.hsn || common.hsn, license: prev.license || common.license });
        else if (pm) Object.assign(common, { type: pm.type || common.type, hsn: pm.hsn || common.hsn });
      }
      if (k === "productName" && !common.catalogueName) {
        const prev = all.find((r) => r.productName === v && r.catalogueName);
        if (prev) Object.assign(common, { catalogueName: prev.catalogueName, type: prev.type, hsn: prev.hsn, license: prev.license });
      }
      return { ...f, common };
    });
  const setB = (i: number, k: BatchKey | "outwardQty", v: string) => update((f) => ({ ...f, batches: f.batches.map((b, j) => (j === i ? { ...b, [k]: v } : b)) }));

  // A Domestic MIS job fills the supplier, product and supply POC (empty fields only) and splits its batches.
  const fromJob = () => {
    const j = jobs.find((x) => String(x.jobNo) === c.jobNo.trim());
    if (!j) {
      setMsg(c.jobNo ? `Job ${c.jobNo} isn't in Domestic MIS — fill the details by hand.` : "");
      return;
    }
    update((f) => {
      const common = { ...f.common };
      if (!common.supplier) common.supplier = j.supplier;
      if (!common.productName) common.productName = j.productName;
      if (!common.supplyPoc) common.supplyPoc = j.supplyPoc;
      let batches = f.batches;
      const bs = j.batchNo.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
      if (!editing && bs.length && batches.length === 1 && !batches[0].batchNo) batches = bs.map((b) => ({ ...blankBatch(), batchNo: b, netWeight: bs.length === 1 ? j.quantityKgs : "" }));
      return { ...f, common, batches };
    });
    setMsg(`Filled from Domestic MIS job ${j.jobNo}: ${j.productName || ""} from ${j.supplier || "—"}.`);
  };

  const total = form.batches.reduce((a, b) => a + (num(b.netWeight) || 0), 0);
  const save = () => {
    if (!c.inwardDate) return setMsg("Enter the inward date.");
    if (!c.productName) return setMsg("Enter the product name.");
    const bad = form.batches.findIndex((b) => num(b.netWeight) === null);
    if (bad >= 0) return setMsg(`Enter the net weight for batch ${bad + 1}.`);
    setMsg("");
    start(async () => {
      const list = form.batches.map((b) => ({ ...c, ...b }));
      const r = form.id ? await updateInward(form.id, list[0]) : await createInward(list);
      if (!r.ok) setMsg("Not saved: " + r.error);
      else onDone();
    });
  };

  const input = (k: CommonKey, extra: { wide?: boolean; select?: readonly string[]; blank?: boolean; type?: string } = {}) => {
    const f = F[k];
    const list = opts[k];
    return (
      <label key={k} className={cn("block text-xs font-medium text-ink-soft", extra.wide && "sm:col-span-2")}>
        <span className="mb-1 block">{f.short || f.label}</span>
        {extra.select ? (
          <select className={inputCls} value={c[k]} onChange={(e) => setC(k, e.target.value)}>
            {extra.blank && <option value="">—</option>}
            {[...new Set([...extra.select, c[k]].filter(Boolean))].map((o) => <option key={o}>{o}</option>)}
          </select>
        ) : (
          <input
            className={inputCls}
            type={extra.type ?? "text"}
            inputMode={f.kind === "num" ? "decimal" : undefined}
            list={list ? `iw-${k}` : undefined}
            value={c[k]}
            onChange={(e) => setC(k, e.target.value)}
            onBlur={k === "jobNo" ? fromJob : undefined}
          />
        )}
        {list && <datalist id={`iw-${k}`}>{list.map((o) => <option key={o} value={o} />)}</datalist>}
      </label>
    );
  };

  return (
    <Modal
      wide
      title={editing ? "Edit inward line" : "New inward"}
      onClose={() => !saving && setForm(null)}
      footer={
        <>
          {msg && <span className="mr-auto text-sm text-ink">{msg}</span>}
          <Button variant="secondary" onClick={() => setForm(null)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : `Save ${form.batches.length} line${form.batches.length > 1 ? "s" : ""}`}</Button>
        </>
      }
    >
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">Receipt</h4>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {input("jobNo")}
        {input("inwardDate", { type: "date" })}
        {input("location", { select: locations })}
        {input("funnel", { select: FUNNELS })}
        {input("supplyPoc")}
        {input("grnNo")}
        {input("supplier")}
        {input("manufacturer")}
        {input("productName", { wide: true })}
        {input("catalogueName", { wide: true })}
        {input("type")}
        {input("hsn")}
        {input("license", { select: LICENSES, blank: true })}
        {input("purchaseRate")}
        {input("remarks", { wide: true })}
      </div>

      <h4 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-ink-faint">{editing ? "Batch" : `Batches · ${form.batches.length} · ${kg(total)} kg`}</h4>
      <div className="overflow-x-auto">
        <table className="min-w-[900px] text-xs">
          <thead>
            <tr>{BATCH.map((k) => <th key={k} className="px-1 pb-1 text-left font-semibold text-ink-soft">{F[k].short || F[k].label}{k === "netWeight" && <span className="text-red-600">*</span>}</th>)}{!editing && <th />}</tr>
          </thead>
          <tbody>
            {form.batches.map((b, i) => (
              <tr key={i}>
                {BATCH.map((k) => (
                  <td key={k} className="px-1 py-0.5">
                    {k === "uom" ? (
                      <select className={inputCls} value={b.uom} onChange={(e) => setB(i, k, e.target.value)}>{[...new Set([...UOMS, b.uom].filter(Boolean))].map((o) => <option key={o}>{o}</option>)}</select>
                    ) : (
                      <input className={inputCls} value={b[k]} list={k === "packaging" ? "iw-packaging" : undefined} inputMode={F[k].kind === "num" ? "decimal" : undefined} placeholder={k === "mfgDate" || k === "expDate" ? "dd/mm/yyyy or Jun-28" : ""} onChange={(e) => setB(i, k, e.target.value)} />
                    )}
                  </td>
                ))}
                {!editing && (
                  <td className="px-1">
                    <button type="button" className="text-ink-faint hover:text-red-600 disabled:opacity-30" title="Remove batch" disabled={form.batches.length < 2} onClick={() => update((f) => ({ ...f, batches: f.batches.filter((_, j) => j !== i) }))}>✕</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id="iw-packaging">{(opts.packaging ?? []).map((o) => <option key={o} value={o} />)}</datalist>
      </div>
      {!editing && (
        <div className="mt-2 flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => update((f) => ({ ...f, batches: [...f.batches, blankBatch()] }))}>+ Add batch</Button>
          <Button variant="secondary" size="sm" onClick={() => update((f) => ({ ...f, batches: [...f.batches, { ...f.batches[f.batches.length - 1], batchNo: "" }] }))}>Copy last batch</Button>
        </div>
      )}
      {editing ? (
        <label className="mt-4 block max-w-sm text-xs font-medium text-ink-soft">
          <span className="mb-1 block">Outward Qty from the old sheet{form.crmOut ? ` (+ ${kg(form.crmOut)} kg dispatched in the ERP)` : ""}</span>
          <input className={inputCls} inputMode="decimal" value={form.batches[0].outwardQty ?? ""} onChange={(e) => setB(0, "outwardQty", e.target.value)} />
        </label>
      ) : (
        <p className="mt-3 text-xs text-ink-faint">Dispatches are recorded in Batch outward; they come off these batches automatically.</p>
      )}
      {form.id && <History entityType="BatchInward" id={form.id} />}
    </Modal>
  );
}
