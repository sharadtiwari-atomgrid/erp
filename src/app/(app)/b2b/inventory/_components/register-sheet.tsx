"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { REGISTERS, cleanEntry, problem, registerSummary, showValue, type RegisterEntry, type RegisterField, type RegisterKind } from "@/lib/batch-inventory";
import { History, ImportDialog, Modal, Tile, inputCls, inr, kg, sheetTable, stickyCol, td, th } from "./kit";
import { deleteRegisterEntry, importRegister, previewRegisterImport, saveRegisterEntry } from "../_lib/register-actions";

type Row = RegisterEntry & { id: string };
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export function RegisterSheet({ kind, rows, names, today, canEdit, initialQ }: { kind: RegisterKind; rows: Row[]; names: string[]; today: string; canEdit: boolean; initialQ: string }) {
  const R = REGISTERS[kind];
  const router = useRouter();
  const [q, setQ] = useState(initialQ);
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [form, setForm] = useState<{ id: string | null; values: Record<string, string> } | null>(null);
  const [importing, setImporting] = useState(false);
  const [err, setErr] = useState("");
  const [, start] = useTransition();
  const typeField = R.fields.find((f) => f.key === "type");
  const listFields = R.fields.filter((f) => f.list).sort((a, b) => Number(b.key === "status") - Number(a.key === "status"));
  const dateKey = R.fields.find((f) => f.kind === "date")!.key;

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const open = R.statuses[0];
    return rows
      .filter((r) => (!status || r.status === status) && (!type || r.type === type) && (!t || R.fields.some((f) => str(r[f.key]).toLowerCase().includes(t))))
      .sort((a, b) => (a.status === open ? 0 : 1) - (b.status === open ? 0 : 1) || str(b[dateKey] || b.etd).localeCompare(str(a[dateKey] || a.etd)));
  }, [rows, q, status, type, R, dateKey]);
  const s = registerSummary(kind, rows);

  const toForm = (e: RegisterEntry) => Object.fromEntries(R.fields.map((f) => [f.key, f.kind === "date" ? str(e[f.key]) : str(e[f.key])]));
  const openNew = () => setForm({ id: null, values: toForm(cleanEntry(kind, { [dateKey]: today, status: R.statuses[0] })) });
  const openEdit = (r: Row) => canEdit && setForm({ id: r.id, values: toForm(r) });
  const remove = (r: Row) => {
    if (!window.confirm(`Delete this entry?\n\n${r.productName || ""} · ${kg(r.qty as number | null)} kg`)) return;
    start(async () => {
      const res = await deleteRegisterEntry(kind, r.id);
      if (!res.ok) setErr(res.error);
      else router.refresh();
    });
  };
  const exportHref = `${R.href}/export?${new URLSearchParams({ q, status, type })}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {kind === "lost-found" ? (
          <>
            <Tile label="Open" value={s.open} hint={`of ${rows.length} issues`} tone={s.open ? "warning" : "default"} />
            <Tile label="At stake on open issues" value={inr(s.atStake)} hint="expected losses" />
            <Tile label="Taken by AG so far" value={inr(s.byAg)} hint="monetary hit taken by AG" />
          </>
        ) : (
          <>
            <Tile label="Open" value={s.open} hint={`of ${rows.length} entries`} tone={s.open ? "warning" : "default"} />
            <Tile label="kg damaged" value={kg(s.kgDamaged)} hint="all Damage entries" />
            <Tile label="Relabelled / repacked" value={s.relabelled} hint="entries" />
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input className={cn(inputCls, "w-64")} type="search" placeholder="Search product, job, batch, remarks…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={cn(inputCls, "w-auto")} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>
          {R.statuses.map((x) => <option key={x}>{x}</option>)}
        </select>
        {typeField?.options && (
          <select className={cn(inputCls, "w-auto")} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {typeField.options.map((x) => <option key={x}>{x}</option>)}
          </select>
        )}
        <span className="flex-1" />
        <a className={buttonClass("secondary", "sm")} href={exportHref}>Export XLSX</a>
        {canEdit && R.sheetName && <Button variant="secondary" size="sm" onClick={() => setImporting(true)}>Import sheet</Button>}
        {canEdit && <Button size="sm" onClick={openNew}>+ New entry</Button>}
      </div>
      {err && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      <div className="max-h-[70vh] overflow-auto rounded-lg border border-line bg-surface">
        <table className={sheetTable}>
          <thead>
            <tr>
              {listFields.map((f, i) => <th key={f.key} className={cn(th, (f.kind === "num" || f.kind === "qty") && "text-right", i === 0 && "left-0 z-20")}>{f.short || f.label}</th>)}
              {canEdit && <th className={th} />}
            </tr>
          </thead>
          <tbody>
            {!filtered.length ? (
              <tr><td colSpan={listFields.length + 1} className="px-4 py-10 text-center text-sm text-ink-faint">{rows.length ? "Nothing matches." : `No entries yet${R.sheetName ? " — add one, or import the sheet" : ""}.`}</td></tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className={cn("hover:bg-muted/40", canEdit && "cursor-pointer")} onDoubleClick={() => openEdit(r)}>
                  {listFields.map((f, i) => (
                    <td key={f.key} className={cn(td, (f.kind === "num" || f.kind === "qty") && "text-right tabular-nums", f.kind === "textarea" && "max-w-72 truncate", i === 0 && stickyCol)} title={f.kind === "textarea" ? str(r[f.key]) || undefined : undefined}>
                      {f.key === "status" ? (
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", r.status === R.statuses[0] ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700")}>{str(r.status)}</span>
                      ) : (
                        showValue(f, r[f.key])
                      )}
                    </td>
                  ))}
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
      <p className="text-xs text-ink-soft">{filtered.length} entries{canEdit ? " · double-click a line to edit" : ""} · these registers don&apos;t move stock.</p>

      {form && <EntryForm kind={kind} form={form} names={names} onClose={() => setForm(null)} onSaved={() => { setForm(null); router.refresh(); }} />}
      {importing && (
        <ImportDialog<RegisterEntry>
          title={`Import the “${R.sheetName}” sheet`}
          hint="The old register sheet as CSV or Excel. Lines already here (same job, product, qty, ETD and batch) are skipped; a line without a final status is saved as open."
          isAdmin={false}
          hasRows={rows.length > 0}
          allowReplace={false}
          preview={(fd) => previewRegisterImport(kind, fd)}
          commit={(input) => importRegister(kind, input)}
          onClose={() => setImporting(false)}
        />
      )}
    </div>
  );
}

function EntryForm({ kind, form, names, onClose, onSaved }: { kind: RegisterKind; form: { id: string | null; values: Record<string, string> }; names: string[]; onClose: () => void; onSaved: () => void }) {
  const R = REGISTERS[kind];
  const [v, setV] = useState(form.values);
  const [msg, setMsg] = useState("");
  const [saving, start] = useTransition();
  const set = (k: string, x: string) => setV((o) => ({ ...o, [k]: x }));
  const shown = (f: RegisterField) => !f.only || f.only.includes(v.type);
  const save = () => {
    const bad = problem(cleanEntry(kind, v));
    if (bad) return setMsg(bad);
    start(async () => {
      const r = await saveRegisterEntry(kind, form.id, v);
      if (!r.ok) setMsg("Not saved: " + r.error);
      else onSaved();
    });
  };
  const control = (f: RegisterField) => {
    const id = `rg-${f.key}`;
    if (f.kind === "select") return <select id={id} className={inputCls} value={v[f.key]} onChange={(e) => set(f.key, e.target.value)}>{f.options!.map((o) => <option key={o}>{o}</option>)}</select>;
    if (f.kind === "textarea") return <textarea id={id} className={inputCls} rows={2} value={v[f.key]} onChange={(e) => set(f.key, e.target.value)} />;
    const list = f.key === "productName" ? names : f.suggest;
    return (
      <>
        <input
          id={id}
          className={inputCls}
          type={f.kind === "date" ? "date" : "text"}
          inputMode={f.kind === "num" || f.kind === "qty" ? "decimal" : undefined}
          placeholder={f.kind === "qty" ? "e.g. 25, 250 gms, 1 MT" : undefined}
          list={list ? `${id}-list` : undefined}
          value={v[f.key]}
          onChange={(e) => set(f.key, e.target.value)}
        />
        {list && <datalist id={`${id}-list`}>{list.map((o) => <option key={o} value={o} />)}</datalist>}
      </>
    );
  };
  return (
    <Modal
      wide
      title={form.id ? `Edit ${R.label} entry` : `New ${R.label} entry`}
      onClose={() => !saving && onClose()}
      footer={
        <>
          {msg && <span className="mr-auto text-sm text-ink">{msg}</span>}
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {R.fields.filter(shown).map((f) => (
          <label key={f.key} htmlFor={`rg-${f.key}`} className={cn("block text-xs font-medium text-ink-soft", f.wide && "sm:col-span-2")}>
            <span className="mb-1 block">{f.label}{f.key === "productName" && <span className="text-red-600">*</span>}</span>
            {control(f)}
          </label>
        ))}
      </div>
      {kind === "lost-found" && <p className="mt-3 text-xs text-ink-faint">Expected loss is worked out as qty × price when left blank.</p>}
      {form.id && <History entityType="InventoryIssue" id={form.id} />}
    </Modal>
  );
}
