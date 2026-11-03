"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { formatDmy, parseDay } from "@/lib/ops/dates";
import { BUSINESS_LEGS, CUSTOMER_TYPES, LOGISTICS_PAYMENT_TERMS, LOGISTICS_TYPES, MOVEMENT_TYPES, ORIGIN_TYPES, PACKAGING, YES_NO } from "@/lib/ops/lists";
import { listPoDocs, savePo, uploadPoDoc } from "./actions";
import {
  FIELD_PHASE,
  PHASES,
  PO_FIELDS,
  SECTIONS,
  STAGE_ORDER,
  STAGES,
  TEAM_LABELS,
  teamCanEdit,
  type FieldDef,
  type OptionList,
  type Phase,
  type Team,
} from "./fields";
import { blankEntry, computeTotal, missingUpTo } from "./logic";
import { AddContactModal, AddProductModal, PasteModal } from "./modals";
import { parsePaste } from "./paste";
import { LONG_HOLD_DAYS } from "./sla";
import type { BoardMasters, BoardViewer, ContactOption, DocItem, PoRow, ProductOption } from "./types";

const OPTIONS: Record<OptionList, string[]> = {
  YES_NO,
  CUSTOMER_TYPES,
  LOGISTICS_PAYMENT_TERMS,
  LOGISTICS_TYPES,
  BUSINESS_LEGS,
  ORIGIN_TYPES,
  MOVEMENT_TYPES,
  PACKAGING,
};

/** Slot in Documents for each file field of the form. */
const FILE_SLOT: Record<string, "PO" | "COA"> = { poAttachment: "PO", coaFile: "COA" };

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const isFilled = (v: unknown) => String(v ?? "").trim() !== "";

function initialValues(row: PoRow | null): Record<string, string> {
  if (!row) return blankEntry();
  return { ...blankEntry(), ...row.values, poDate: formatDmy(row.values.poDate) };
}

export function PoForm({
  row,
  team,
  viewer,
  masters,
  onClose,
  onSaved,
}: {
  row: PoRow | null;
  team: Team;
  viewer: BoardViewer;
  masters: BoardMasters;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const initial = useMemo(() => initialValues(row), [row]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [errors, setErrors] = useState<Set<string>>(new Set());
  const [banner, setBanner] = useState("");
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState(false);
  const [adding, setAdding] = useState<null | "customer" | "supplier" | "product">(null);
  const [added, setAdded] = useState<{ customers: ContactOption[]; suppliers: ContactOption[]; products: ProductOption[] }>({ customers: [], suppliers: [], products: [] });
  const [pendingFiles, setPendingFiles] = useState<Record<string, File | null>>({});
  const [docs, setDocs] = useState<DocItem[]>([]);

  const customers = useMemo(() => [...added.customers, ...masters.customers], [added.customers, masters.customers]);
  const suppliers = useMemo(() => [...added.suppliers, ...masters.suppliers], [added.suppliers, masters.suppliers]);
  const products = useMemo(() => [...added.products, ...masters.products], [added.products, masters.products]);
  const customer = customers.find((c) => same(c.name, values.customer ?? ""));
  const supplier = suppliers.find((s) => same(s.name, values.supplier ?? ""));
  const total = computeTotal(values.qtyToDispatch, values.rate);

  const rowId = row?.id;
  useEffect(() => {
    if (!rowId) return;
    let alive = true;
    listPoDocs(rowId)
      .then((d) => alive && setDocs(d))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [rowId]);

  const stageIdx = STAGE_ORDER.indexOf(row?.stage ?? "DEMAND_PENDING");
  const activePhase = STAGES[row?.stage ?? "DEMAND_PENDING"].phase;
  const editable = (phase: Phase) => viewer.canEdit && teamCanEdit(team, phase);

  function clearError(key: string) {
    setErrors((e) => {
      if (!e.has(key)) return e;
      const n = new Set(e);
      n.delete(key);
      return n;
    });
  }

  function setField(key: string, val: string) {
    setValues((f) => {
      const next = { ...f, [key]: val };
      if (key === "product") {
        const p = products.find((x) => same(x.name, val));
        next.productType = p?.productClass ?? "";
        if (p && !next.hsnCode && p.hsnCode) next.hsnCode = p.hsnCode;
      }
      if (key === "customer" && !same(val, f.customer ?? "")) {
        const c = customers.find((x) => same(x.name, val));
        next.customerPoc = c?.pocs.length === 1 ? c.pocs[0] : "";
        next.deliveryAddress = c?.addresses.length === 1 ? c.addresses[0] : "";
      }
      if (key === "supplier" && !same(val, f.supplier ?? "")) {
        const s = suppliers.find((x) => same(x.name, val));
        next.supplyPoc = s?.pocs.length === 1 ? s.pocs[0] : "";
        next.pickupAddress = s?.addresses.length === 1 ? s.addresses[0] : "";
      }
      return next;
    });
    if (isFilled(val)) clearError(key);
  }

  function scrollTo(key: string) {
    const el = document.getElementById(`f-${key}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus?.();
    }
  }

  /** Fields to send: everything for a new PO, only what changed for an edit. */
  function payload(): Record<string, string> {
    const working = { ...values };
    // The total follows qty × rate only when one of them is entered or changed.
    const qtyOrRateChanged = !row || values.qtyToDispatch !== initial.qtyToDispatch || values.rate !== initial.rate;
    if (total && qtyOrRateChanged) working.totalTaxable = total;
    const out: Record<string, string> = {};
    for (const k of PO_FIELDS) {
      const v = (working[k] ?? "").trim();
      if (!row ? v !== "" : v !== (initial[k] ?? "").trim()) out[k] = v;
    }
    return out;
  }

  async function submit(advance: Phase | null, confirmDuplicate = false): Promise<void> {
    const working = { ...values, totalTaxable: total || values.totalTaxable };
    if (advance) {
      const miss = missingUpTo(advance, working);
      if (miss.length) {
        setErrors(new Set(miss));
        const verb = PHASES[advance].next.replace("→", "").trim();
        setBanner(`${miss.length} required field${miss.length > 1 ? "s" : ""} still needed to “${verb}”. They’re highlighted below.`);
        scrollTo(miss[0]);
        return;
      }
    }
    if (isFilled(values.poDate) && !parseDay(values.poDate)) {
      setErrors(new Set(["poDate"]));
      setBanner("PO Date isn’t a date — use dd/mm/yyyy.");
      scrollTo("poDate");
      return;
    }
    setErrors(new Set());
    setBanner("");
    setBusy(true);
    const res = await savePo({ id: row?.id, team, values: payload(), advance, confirmDuplicate }).catch((e: unknown) => ({
      ok: false as const,
      error: e instanceof Error ? e.message : "The server didn’t answer.",
      missing: undefined,
      duplicateOf: undefined,
    }));
    if (!res.ok) {
      setBusy(false);
      if (res.duplicateOf) {
        const ok = window.confirm(
          `A PO for “${values.customer}” · “${values.product}” on ${values.poDate || "—"} already exists (#${res.duplicateOf}).\n\nCreate another anyway?`,
        );
        if (ok) return submit(advance, true);
        return;
      }
      if (res.missing?.length) {
        setErrors(new Set(res.missing));
        scrollTo(res.missing[0]);
      }
      setBanner(`Not saved: ${res.error}`);
      return;
    }
    const failed: string[] = [];
    for (const [key, file] of Object.entries(pendingFiles)) {
      if (!file) continue;
      const fd = new FormData();
      fd.set("poId", res.id);
      fd.set("kind", FILE_SLOT[key]);
      fd.set("file", file);
      const up = await uploadPoDoc(fd).catch(() => ({ ok: false as const, error: "upload failed" }));
      if (!up.ok) failed.push(`${file.name} (${up.error})`);
    }
    setBusy(false);
    const msg = res.held
      ? `PO #${res.requestNo} has been moved to Long Hold PO — its PO date is over ${LONG_HOLD_DAYS} days ago.`
      : row
        ? `PO #${res.requestNo} saved.`
        : `PO #${res.requestNo} created.`;
    onSaved(failed.length ? `${msg} Not uploaded: ${failed.join(", ")}.` : msg);
  }

  async function uploadNow(key: string, file: File | undefined) {
    if (!file) return;
    if (!row) {
      setPendingFiles((p) => ({ ...p, [key]: file }));
      return;
    }
    const fd = new FormData();
    fd.set("poId", row.id);
    fd.set("kind", FILE_SLOT[key]);
    fd.set("file", file);
    const res = await uploadPoDoc(fd);
    if (!res.ok) setBanner(`${file.name} wasn’t uploaded: ${res.error}`);
    setDocs(await listPoDocs(row.id));
  }

  function applyPaste(text: string) {
    const parsed = parsePaste(text);
    let skipped = 0;
    const next = { ...values };
    for (const [k, v] of Object.entries(parsed)) {
      if (k === "requestNo") continue;
      if (!editable(FIELD_PHASE[k])) {
        skipped++;
        continue;
      }
      next[k] = v;
    }
    const p = products.find((x) => same(x.name, next.product ?? ""));
    if (p) {
      next.productType = next.productType || p.productClass;
      next.hsnCode = next.hsnCode || p.hsnCode;
    }
    setValues(next);
    setPaste(false);
    setBanner(skipped ? `Filled from the email. ${skipped} value(s) belong to other teams’ sections and were left out.` : "");
  }

  const ctx: Ctx = {
    values,
    setField,
    row,
    total,
    customers,
    suppliers,
    products,
    pocs: masters.pocs,
    customer,
    supplier,
    viewer,
    onAdd: setAdding,
    docs,
    pendingFiles,
    uploadNow,
  };

  return (
    <Card className="mb-6">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h2 className="text-base font-semibold text-ink">{row ? `Edit PO #${row.requestNo}` : "New Fresh PO"}</h2>
        <button type="button" className="rounded p-1 text-ink-soft hover:bg-muted hover:text-ink" onClick={onClose} aria-label="Close form">
          ✕
        </button>
      </div>

      {banner && <div className="mx-5 mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">⚠ {banner}</div>}

      <div className="space-y-4 px-5 py-4">
        {SECTIONS.map((section) => {
          const req = section.fields.filter((f) => f.req && !f.auto);
          const done = req.filter((f) => isFilled(values[f.key])).length;
          const passed = stageIdx > STAGE_ORDER.indexOf(`${section.phase.toUpperCase()}_PENDING` as (typeof STAGE_ORDER)[number]);
          const canEditSection = editable(section.phase);
          return (
            <section
              key={section.phase}
              className={cn("rounded-lg border", activePhase === section.phase ? "border-brand-500 ring-1 ring-brand-500/20" : "border-line", !canEditSection && "bg-muted/30")}
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
                <h3 className="text-sm font-semibold text-ink">{section.team}</h3>
                <span className={cn("rounded-full px-2 py-0.5 text-xs", done === req.length ? "bg-emerald-50 text-emerald-700" : "bg-muted text-ink-soft")}>
                  {done}/{req.length} required
                </span>
                {!canEditSection && <span className="text-xs text-ink-faint">View only</span>}
                {canEditSection && section.phase !== "logistics" && (
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setPaste(true)}>
                    Paste from email
                  </Button>
                )}
              </div>
              <fieldset disabled={!canEditSection || busy} className="grid grid-cols-1 gap-x-4 gap-y-3 px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
                {section.fields.map((field) => (
                  <FieldBox key={field.key} field={field} error={errors.has(field.key)} ctx={ctx} />
                ))}
              </fieldset>
              <div className="flex items-center justify-end border-t border-line px-4 py-2.5">
                {passed ? (
                  <span className="text-sm text-emerald-700">✓ {section.phase === "logistics" ? "Ready for Operations" : "Submitted"}</span>
                ) : canEditSection ? (
                  <Button size="sm" disabled={busy} onClick={() => void submit(section.phase)}>
                    {PHASES[section.phase].next}
                  </Button>
                ) : (
                  <span className="text-xs text-ink-faint">
                    Acting as {TEAM_LABELS[team]} — this section is view only
                  </span>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        {viewer.canEdit && (
          <Button variant="secondary" onClick={() => void submit(null)} disabled={busy}>
            {busy ? "Saving…" : "Save draft"}
          </Button>
        )}
      </div>

      {paste && <PasteModal onClose={() => setPaste(false)} onApply={applyPaste} />}
      {(adding === "customer" || adding === "supplier") && (
        <AddContactModal
          role={adding === "customer" ? "CUSTOMER" : "SUPPLIER"}
          defaultName={values[adding] ?? ""}
          onClose={() => setAdding(null)}
          onSaved={(c) => {
            const key = adding;
            setAdded((a) => (key === "customer" ? { ...a, customers: [c, ...a.customers] } : { ...a, suppliers: [c, ...a.suppliers] }));
            setValues((f) =>
              key === "customer"
                ? { ...f, customer: c.name, customerPoc: c.pocs[0] ?? f.customerPoc, deliveryAddress: c.addresses[0] ?? f.deliveryAddress }
                : { ...f, supplier: c.name, supplyPoc: c.pocs[0] ?? f.supplyPoc, pickupAddress: c.addresses[0] ?? f.pickupAddress },
            );
            clearError(key);
            setAdding(null);
          }}
        />
      )}
      {adding === "product" && (
        <AddProductModal
          defaultName={values.product ?? ""}
          onClose={() => setAdding(null)}
          onSaved={(p) => {
            setAdded((a) => ({ ...a, products: [p, ...a.products] }));
            setValues((f) => ({ ...f, product: p.name, productType: p.productClass, hsnCode: f.hsnCode || p.hsnCode }));
            clearError("product");
            setAdding(null);
          }}
        />
      )}
    </Card>
  );
}

type Ctx = {
  values: Record<string, string>;
  setField: (key: string, val: string) => void;
  row: PoRow | null;
  total: string;
  customers: ContactOption[];
  suppliers: ContactOption[];
  products: ProductOption[];
  pocs: string[];
  customer?: ContactOption;
  supplier?: ContactOption;
  viewer: BoardViewer;
  onAdd: (what: "customer" | "supplier" | "product") => void;
  docs: DocItem[];
  pendingFiles: Record<string, File | null>;
  uploadNow: (key: string, file: File | undefined) => void;
};

function FieldBox({ field, error, ctx }: { field: FieldDef; error: boolean; ctx: Ctx }) {
  const id = `f-${field.key}`;
  const wide = field.type === "textarea" || field.type === "customerAddress" || field.type === "supplierPickups" || field.type === "supplierPocs";
  return (
    <div className={cn(wide && "sm:col-span-2")}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-ink">
        {field.label}
        {field.req && <span className="ml-0.5 text-red-600">*</span>}
        {field.hint && <span className="font-normal text-ink-faint"> · {field.hint}</span>}
      </label>
      <div className={cn(error && "rounded-md ring-2 ring-red-500")}>
        <Control field={field} id={id} ctx={ctx} />
      </div>
      {error && <p className="mt-0.5 text-xs text-red-600">Required</p>}
    </div>
  );
}

function Control({ field, id, ctx }: { field: FieldDef; id: string; ctx: Ctx }) {
  const { values, setField } = ctx;
  const value = values[field.key] ?? "";
  const set = (v: string) => setField(field.key, v);

  switch (field.type) {
    case "auto":
      return <Input id={id} readOnly value={ctx.row ? `#${ctx.row.requestNo}` : "Assigned on save"} className="bg-muted text-ink-soft" />;
    case "readonly":
      return <Input id={id} readOnly value={value} placeholder="—" className="bg-muted" />;
    case "computed":
      return <Input id={id} readOnly value={ctx.total ? formatNumber(ctx.total, 1) : value ? formatNumber(value, 1) : ""} placeholder="auto" className="bg-muted font-medium tabular-nums" />;
    case "number":
      return <Input id={id} inputMode="decimal" value={value} onChange={(e) => set(e.target.value)} placeholder="0" className="tabular-nums" />;
    case "date":
      return <Input id={id} value={value} onChange={(e) => set(e.target.value)} placeholder="dd/mm/yyyy" />;
    case "textarea":
      return <Textarea id={id} rows={2} value={value} onChange={(e) => set(e.target.value)} />;
    case "enum": {
      const opts = OPTIONS[field.options!];
      return (
        <Select id={id} value={value} onChange={(e) => set(e.target.value)}>
          <option value="">— select —</option>
          {value && !opts.includes(value) && <option value={value}>{value}</option>}
          {opts.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </Select>
      );
    }
    case "verifier":
      return (
        <Select id={id} value={value} onChange={(e) => set(e.target.value)}>
          <option value="">— select —</option>
          {value && !ctx.pocs.includes(value) && <option value={value}>{value}</option>}
          {ctx.pocs.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </Select>
      );
    case "poc":
      return <Listed id={id} value={value} set={set} options={ctx.pocs} placeholder="type or pick…" />;
    case "autocomplete":
      return <Listed id={id} value={value} set={set} options={OPTIONS[field.options!]} placeholder="type or pick…" />;
    case "text":
      return <Input id={id} value={value} onChange={(e) => set(e.target.value)} />;
    case "customer":
      return <MasterPick id={id} value={value} set={set} options={ctx.customers.map((c) => c.name)} what="customer" canAdd={ctx.viewer.canAddContacts} onAdd={() => ctx.onAdd("customer")} />;
    case "supplier":
      return <MasterPick id={id} value={value} set={set} options={ctx.suppliers.map((c) => c.name)} what="supplier" canAdd={ctx.viewer.canAddContacts} onAdd={() => ctx.onAdd("supplier")} />;
    case "product":
      return <MasterPick id={id} value={value} set={set} options={ctx.products.map((p) => p.name)} what="product" canAdd={ctx.viewer.canAddProducts} onAdd={() => ctx.onAdd("product")} />;
    case "customerPoc":
      return <SelectFrom id={id} value={value} set={set} options={ctx.customer?.pocs ?? []} empty="Pick a customer first" />;
    case "customerAddress":
      return <SelectFrom id={id} value={value} set={set} options={ctx.customer?.addresses ?? []} empty="Pick a customer first" />;
    case "supplierPocs":
      return <MultiFrom id={id} value={value} set={set} options={ctx.supplier?.pocs ?? []} empty="Pick a supplier first" />;
    case "supplierPickups":
      return <MultiFrom id={id} value={value} set={set} options={ctx.supplier?.addresses ?? []} empty="Pick a supplier first" />;
    case "file": {
      const slot = FILE_SLOT[field.key];
      const files = ctx.docs.filter((d) => d.field === slot);
      const pending = ctx.pendingFiles[field.key];
      return (
        <div className="space-y-1">
          <input
            id={id}
            type="file"
            accept="application/pdf,image/*"
            className="block w-full text-xs text-ink-soft file:mr-2 file:rounded-md file:border file:border-line file:bg-surface file:px-2 file:py-1 file:text-xs file:text-ink"
            onChange={(e) => {
              ctx.uploadNow(field.key, e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {pending && <p className="text-xs text-ink-soft">{pending.name} — uploads when the PO is saved</p>}
          {files.map((d) => (
            <p key={d.id} className="truncate text-xs">
              <a className="text-brand-700 hover:underline" href={d.url} target="_blank" rel="noreferrer">
                {d.fileName}
              </a>{" "}
              <a className="text-ink-soft hover:text-ink" href={d.downloadUrl}>
                Download
              </a>
            </p>
          ))}
        </div>
      );
    }
    default:
      return <Input id={id} value={value} onChange={(e) => set(e.target.value)} />;
  }
}

function Listed({ id, value, set, options, placeholder }: { id: string; value: string; set: (v: string) => void; options: string[]; placeholder?: string }) {
  return (
    <>
      <Input id={id} list={`${id}-l`} value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} autoComplete="off" />
      <datalist id={`${id}-l`}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </>
  );
}

function MasterPick({
  id,
  value,
  set,
  options,
  what,
  canAdd,
  onAdd,
}: {
  id: string;
  value: string;
  set: (v: string) => void;
  options: string[];
  what: string;
  canAdd: boolean;
  onAdd: () => void;
}) {
  const unmatched = value.trim() !== "" && !options.some((o) => same(o, value));
  return (
    <div>
      <div className="flex gap-1.5">
        <div className="min-w-0 flex-1">
          <Listed id={id} value={value} set={set} options={options} placeholder="search…" />
        </div>
        {canAdd && (
          <Button size="sm" variant="secondary" className="h-9" onClick={onAdd} title={`Add ${what}`}>
            +
          </Button>
        )}
      </div>
      {unmatched && (
        <p className="mt-0.5 text-xs text-amber-700">
          Not in the {what} master.{" "}
          {canAdd && (
            <button type="button" className="font-medium text-brand-700 hover:underline" onClick={onAdd}>
              + Add {what}
            </button>
          )}
        </p>
      )}
    </div>
  );
}

function SelectFrom({ id, value, set, options, empty }: { id: string; value: string; set: (v: string) => void; options: string[]; empty: string }) {
  const [typing, setTyping] = useState(false);
  if (!options.length || typing) {
    return (
      <div>
        <Textarea id={id} rows={1} value={value} onChange={(e) => set(e.target.value)} placeholder={options.length ? "type new…" : empty} />
        {typing && (
          <button type="button" className="mt-0.5 text-xs text-brand-700 hover:underline" onClick={() => setTyping(false)}>
            Pick from the list
          </button>
        )}
      </div>
    );
  }
  return (
    <div>
      <Select id={id} value={value} onChange={(e) => set(e.target.value)}>
        <option value="">— select —</option>
        {value && !options.includes(value) && <option value={value}>{value}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </Select>
      <button type="button" className="mt-0.5 text-xs text-brand-700 hover:underline" onClick={() => setTyping(true)}>
        + add new
      </button>
    </div>
  );
}

/** Multi-select chips, stored joined with " ; ". */
function MultiFrom({ id, value, set, options, empty }: { id: string; value: string; set: (v: string) => void; options: string[]; empty: string }) {
  const [adding, setAdding] = useState("");
  const selected = value.split(" ; ").map((s) => s.trim()).filter(Boolean);
  const all = [...options, ...selected.filter((s) => !options.includes(s))];
  const toggle = (opt: string) => {
    const s = new Set(selected);
    if (s.has(opt)) s.delete(opt);
    else s.add(opt);
    set([...s].join(" ; "));
  };
  if (!all.length) return <Textarea id={id} rows={1} value={value} onChange={(e) => set(e.target.value)} placeholder={empty} />;
  return (
    <div>
      <div className="flex flex-wrap gap-1.5" id={id} tabIndex={-1}>
        {all.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => toggle(o)}
            className={cn(
              "max-w-full truncate rounded-full border px-2.5 py-1 text-left text-xs",
              selected.includes(o) ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line bg-surface text-ink-soft hover:bg-muted",
            )}
            title={o}
          >
            {selected.includes(o) ? "✓ " : ""}
            {o}
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <Input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="add new…" className="h-8 text-xs" />
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            const v = adding.trim();
            if (v && !selected.includes(v)) set([...selected, v].join(" ; "));
            setAdding("");
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
