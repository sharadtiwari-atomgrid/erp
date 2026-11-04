"use client";

import { useActionState, useMemo, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatMoney } from "@/lib/format";
import type { ActionState } from "@/lib/forms";
import { addDaysIso } from "@/lib/ops/dates";
import { splitGst } from "@/lib/totals";
import { computeBill, type BillLine } from "../_ar_ap/bill-lines";

export type BillFormValues = {
  supplierId: string;
  supplierInvoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  branchId: string;
  placeOfSupply: string;
  itcEligible: boolean;
  notes: string;
  purchaseOrderId: string;
  inboundReceiptId: string;
  lines: BillLine[];
};

type Supplier = { id: string; code: string; name: string; state: string | null; paymentTermsDays: number; transporter: boolean };
type ProductOpt = { id: string; sku: string; name: string; unit: string; purchasePrice: number; taxRate: number; hsnCode: string | null };
type AccountOpt = { id: string; code: string; name: string; type: string };

type Row = { key: number; kind: "item" | "expense"; productId: string; glAccountId: string; description: string; hsnCode: string; quantity: string; unitPrice: string; discountPct: string; taxRate: string };

let nextKey = 1;
const toRow = (l?: Partial<BillLine> & { kind: "item" | "expense" }): Row => ({
  key: nextKey++,
  kind: l?.kind ?? "item",
  productId: l?.productId ?? "",
  glAccountId: l?.glAccountId ?? "",
  description: l?.description ?? "",
  hsnCode: l?.hsnCode ?? "",
  quantity: String(l?.quantity ?? 1),
  unitPrice: String(l?.unitPrice ?? 0),
  discountPct: String(l?.discountPct ?? 0),
  taxRate: String(l?.taxRate ?? 18),
});
const toLine = (r: Row): BillLine => ({
  kind: r.kind,
  productId: r.kind === "item" ? r.productId || null : null,
  glAccountId: r.kind === "expense" ? r.glAccountId || null : null,
  description: r.description || null,
  hsnCode: r.hsnCode || null,
  quantity: Number(r.quantity) || 0,
  unitPrice: Number(r.unitPrice) || 0,
  discountPct: Number(r.discountPct) || 0,
  taxRate: Number(r.taxRate) || 0,
});

const cellInput = "h-8 px-2 text-right tabular-nums";

export function BillForm({
  action,
  initial,
  suppliers,
  branches,
  products,
  accounts,
  companyState,
  cancelHref,
  notice,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial: BillFormValues;
  suppliers: Supplier[];
  branches: Array<{ id: string; code: string; name: string }>;
  products: ProductOpt[];
  accounts: AccountOpt[];
  companyState: string | null;
  cancelHref: string;
  notice?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};
  const [supplierId, setSupplierId] = useState(initial.supplierId);
  const [invoiceDate, setInvoiceDate] = useState(initial.invoiceDate);
  const [dueDate, setDueDate] = useState(initial.dueDate);
  const [placeOfSupply, setPlaceOfSupply] = useState(initial.placeOfSupply);
  const [itc, setItc] = useState(initial.itcEligible);
  const [rows, setRows] = useState<Row[]>(() => (initial.lines.length ? initial.lines.map(toRow) : [toRow({ kind: "item" })]));
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const supplier = suppliers.find((s) => s.id === supplierId);

  const lines = rows.map(toLine);
  const doc = computeBill(lines);
  const gst = splitGst(doc.taxTotal, companyState, placeOfSupply || supplier?.state);

  function pickSupplier(id: string) {
    setSupplierId(id);
    const s = suppliers.find((x) => x.id === id);
    if (s) {
      setPlaceOfSupply(s.state ?? "");
      setDueDate(addDaysIso(invoiceDate, s.paymentTermsDays));
    }
  }

  function update(key: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function pickProduct(key: number, productId: string) {
    const p = productById.get(productId);
    update(key, p ? { productId, unitPrice: String(p.purchasePrice), taxRate: String(p.taxRate), hsnCode: p.hsnCode ?? "" } : { productId });
  }

  const accountGroups = [
    { label: "Expenses", items: accounts.filter((a) => a.type === "EXPENSE") },
    { label: "Assets (fixed assets, prepaid…)", items: accounts.filter((a) => a.type === "ASSET") },
  ];

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      {notice && <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</div>}
      <Card>
        <CardHeader title="Bill" description="The number is assigned when you save." />
        <CardBody>
          <FormGrid className="lg:grid-cols-3">
            <Field label="Supplier" htmlFor="supplierId" required errors={err.supplierId}>
              <Select id="supplierId" name="supplierId" value={supplierId} onChange={(e) => pickSupplier(e.target.value)} required>
                <option value="">Select a supplier…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code}){s.transporter ? " · transporter" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Supplier invoice no." htmlFor="supplierInvoiceNo" errors={err.supplierInvoiceNo}>
              <Input id="supplierInvoiceNo" name="supplierInvoiceNo" defaultValue={initial.supplierInvoiceNo} />
            </Field>
            <Field label="Branch" htmlFor="branchId" required errors={err.branchId}>
              <Select id="branchId" name="branchId" defaultValue={initial.branchId} required>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Invoice date" htmlFor="invoiceDate" required errors={err.invoiceDate}>
              <Input
                id="invoiceDate"
                name="invoiceDate"
                type="date"
                value={invoiceDate}
                onChange={(e) => {
                  setInvoiceDate(e.target.value);
                  if (supplier && e.target.value) setDueDate(addDaysIso(e.target.value, supplier.paymentTermsDays));
                }}
                required
              />
            </Field>
            <Field label="Due date" htmlFor="dueDate" errors={err.dueDate} hint={supplier ? `Supplier terms: ${supplier.paymentTermsDays} days` : "Blank = invoice date + supplier’s terms"}>
              <Input id="dueDate" name="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
            <Field label="Place of supply (state)" htmlFor="placeOfSupply" errors={err.placeOfSupply} hint={companyState ? `Your state: ${companyState}` : "Set your state in company settings"}>
              <Input id="placeOfSupply" name="placeOfSupply" value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} placeholder={supplier?.state ?? ""} />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink">
              <input type="checkbox" name="itcEligible" checked={itc} onChange={(e) => setItc(e.target.checked)} className="h-4 w-4 rounded border-line" />
              Input tax credit (ITC) eligible
            </label>
            <Field label="Notes" htmlFor="notes" errors={err.notes} className="lg:col-span-2">
              <Textarea id="notes" name="notes" rows={1} defaultValue={initial.notes} />
            </Field>
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Lines"
          description="Item lines post to Purchases; expense and asset lines post to the ledger account you choose."
          actions={
            <>
              <Button variant="secondary" size="sm" onClick={() => setRows((rs) => [...rs, toRow({ kind: "item" })])}>
                Add item line
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setRows((rs) => [...rs, toRow({ kind: "expense" })])}>
                Add expense line
              </Button>
            </>
          }
        />
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-line text-sm">
            <thead className="bg-muted/60 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-3 py-2 text-left">Item / account</th>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-left">HSN/SAC</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Rate</th>
                <th className="px-3 py-2 text-right">Disc %</th>
                <th className="px-3 py-2 text-right">GST %</th>
                <th className="px-3 py-2 text-right">Taxable</th>
                <th className="px-3 py-2 text-right">GST</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r, i) => {
                const computed = doc.lines[i];
                return (
                  <tr key={r.key} className="align-top">
                    <td className="min-w-56 px-3 py-2">
                      {r.kind === "item" ? (
                        <Select value={r.productId} onChange={(e) => pickProduct(r.key, e.target.value)} aria-label="Item" className="h-8">
                          <option value="">Item…</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.sku})
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Select value={r.glAccountId} onChange={(e) => update(r.key, { glAccountId: e.target.value })} aria-label="Ledger account" className="h-8">
                          <option value="">Ledger account…</option>
                          {accountGroups.map((g) => (
                            <optgroup key={g.label} label={g.label}>
                              {g.items.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.code} {a.name}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </Select>
                      )}
                      <p className="mt-0.5 text-xs text-ink-faint">{r.kind === "item" ? "Item" : "Expense / asset"}</p>
                    </td>
                    <td className="min-w-40 px-3 py-2">
                      <Input value={r.description} onChange={(e) => update(r.key, { description: e.target.value })} aria-label="Description" className="h-8 px-2" />
                    </td>
                    <td className="w-24 px-3 py-2">
                      <Input value={r.hsnCode} onChange={(e) => update(r.key, { hsnCode: e.target.value })} aria-label="HSN/SAC" className="h-8 px-2" />
                    </td>
                    <td className="w-24 px-3 py-2">
                      <Input type="number" min="0" step="0.001" value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value })} aria-label="Quantity" className={cellInput} />
                      {r.kind === "item" && productById.get(r.productId) && <p className="mt-0.5 text-right text-xs text-ink-faint">{productById.get(r.productId)?.unit}</p>}
                    </td>
                    <td className="w-28 px-3 py-2">
                      <Input type="number" min="0" step="0.01" value={r.unitPrice} onChange={(e) => update(r.key, { unitPrice: e.target.value })} aria-label="Rate" className={cellInput} />
                    </td>
                    <td className="w-20 px-3 py-2">
                      <Input type="number" min="0" max="100" step="0.01" value={r.discountPct} onChange={(e) => update(r.key, { discountPct: e.target.value })} aria-label="Discount %" className={cellInput} />
                    </td>
                    <td className="w-20 px-3 py-2">
                      <Select value={r.taxRate} onChange={(e) => update(r.key, { taxRate: e.target.value })} aria-label="GST rate" className="h-8 px-2">
                        {[...new Set(["0", "0.1", "0.25", "3", "5", "12", "18", "28", r.taxRate])].map((v) => (
                          <option key={v} value={v}>
                            {v}%
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink">{formatMoney(computed?.lineTotal ?? 0)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-ink-soft">{formatMoney(computed?.taxAmount ?? 0)}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : rs))}
                        className="text-xs text-ink-soft hover:text-red-600"
                        aria-label="Remove line"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <dl className="ml-auto w-full max-w-sm space-y-1 px-5 py-4 text-sm">
          <div className="flex justify-between">
            <dt>Taxable value</dt>
            <dd className="tabular-nums">{formatMoney(doc.subtotal)}</dd>
          </div>
          {gst.interState ? (
            <div className="flex justify-between">
              <dt>IGST</dt>
              <dd className="tabular-nums">{formatMoney(gst.igst)}</dd>
            </div>
          ) : (
            <>
              <div className="flex justify-between">
                <dt>CGST</dt>
                <dd className="tabular-nums">{formatMoney(gst.cgst)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>SGST</dt>
                <dd className="tabular-nums">{formatMoney(gst.sgst)}</dd>
              </div>
            </>
          )}
          <div className="flex justify-between border-t border-line pt-1 font-semibold">
            <dt>Total payable</dt>
            <dd className="tabular-nums">{formatMoney(doc.total)}</dd>
          </div>
          {!itc && doc.taxTotal > 0 && <p className="text-xs text-ink-soft">No ITC: the GST is added to the cost of each line.</p>}
        </dl>
      </Card>

      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <input type="hidden" name="purchaseOrderId" value={initial.purchaseOrderId} />
      <input type="hidden" name="inboundReceiptId" value={initial.inboundReceiptId} />
      <div className="flex flex-wrap justify-end gap-2">
        <ButtonLink href={cancelHref} variant="ghost">
          Cancel
        </ButtonLink>
        <SubmitButton name="intent" value="draft" variant="secondary" pendingText="Saving…">
          Save draft
        </SubmitButton>
        <SubmitButton name="intent" value="post" pendingText="Posting…" confirmMessage="Post this bill to the ledger? It can’t be edited afterwards.">
          Save and post
        </SubmitButton>
      </div>
    </form>
  );
}
