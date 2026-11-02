"use client";

import { useActionState, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import type { ActionState } from "@/lib/forms";

type Option = { id: string; code: string; name: string };
type ProductOption = { id: string; sku: string; name: string; unit: string; purchasePrice: number; qcRequired: boolean };
type Row = { key: number; productId: string; receivedQty: string; unitCost: string };

let nextKey = 1;
const newRow = (): Row => ({ key: nextKey++, productId: "", receivedQty: "1", unitCost: "0" });

/** Standalone GRN: supplier, warehouse, transport details and received products. */
export function GrnForm({
  action,
  suppliers,
  warehouses,
  products,
  today,
  defaultWarehouseId,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  suppliers: Option[];
  warehouses: Option[];
  products: ProductOption[];
  today: string;
  defaultWarehouseId: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};
  const [rows, setRows] = useState<Row[]>(() => [newRow()]);
  const byId = new Map(products.map((p) => [p.id, p]));

  const lines = rows
    .filter((r) => r.productId)
    .map((r) => ({ productId: r.productId, receivedQty: Number(r.receivedQty) || 0, unitCost: Number(r.unitCost) || 0 }));
  const value = lines.reduce((s, l) => s + l.receivedQty * l.unitCost, 0);

  function update(key: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <Card>
        <CardHeader title="Receipt" />
        <CardBody>
          <FormGrid>
            <Field label="Supplier" htmlFor="supplierId" required errors={err.supplierId}>
              <Select id="supplierId" name="supplierId" defaultValue="" required>
                <option value="">Select a supplier…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Receiving warehouse" htmlFor="warehouseId" required errors={err.warehouseId}>
              <Select id="warehouseId" name="warehouseId" defaultValue={defaultWarehouseId} required>
                <option value="">Select a warehouse…</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Received on" htmlFor="receivedAt" errors={err.receivedAt}>
              <Input id="receivedAt" name="receivedAt" type="date" defaultValue={today} />
            </Field>
            <Field label="Supplier invoice no." htmlFor="supplierInvoice" errors={err.supplierInvoice}>
              <Input id="supplierInvoice" name="supplierInvoice" />
            </Field>
            <Field label="Vehicle no." htmlFor="vehicleNo" errors={err.vehicleNo} hint="e.g. MH12AB1234">
              <Input id="vehicleNo" name="vehicleNo" className="uppercase" />
            </Field>
            <Field label="Notes" htmlFor="notes" errors={err.notes} className="sm:col-span-2">
              <Textarea id="notes" name="notes" rows={2} />
            </Field>
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Products received" description="Stock is posted only for the quantity accepted in QC." />
        <CardBody>
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="min-w-full divide-y divide-line text-sm">
              <thead className="bg-muted/60 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="w-32 px-3 py-2 text-right">Received</th>
                  <th className="w-36 px-3 py-2 text-right">Unit cost</th>
                  <th className="w-10 px-2 py-2" aria-label="Remove" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => {
                  const product = byId.get(row.productId);
                  return (
                    <tr key={row.key}>
                      <td className="min-w-64 px-3 py-2">
                        <Select
                          value={row.productId}
                          onChange={(e) => {
                            const p = byId.get(e.target.value);
                            update(row.key, { productId: e.target.value, ...(p && { unitCost: String(p.purchasePrice) }) });
                          }}
                          aria-label="Product"
                        >
                          <option value="">Select a product…</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.sku} — {p.name}
                            </option>
                          ))}
                        </Select>
                        {product?.qcRequired && (
                          <div className="mt-1">
                            <Badge tone="amber">QC required</Badge>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min="0"
                            step="any"
                            className="text-right"
                            value={row.receivedQty}
                            onChange={(e) => update(row.key, { receivedQty: e.target.value })}
                            aria-label="Received quantity"
                          />
                          <span className="text-xs text-ink-faint">{product?.unit}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          className="text-right"
                          value={row.unitCost}
                          onChange={(e) => update(row.key, { unitCost: e.target.value })}
                          aria-label="Unit cost"
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== row.key) : rs))}
                          className="rounded p-1 text-ink-faint hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                          disabled={rows.length === 1}
                          aria-label="Remove line"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <Button variant="secondary" size="sm" onClick={() => setRows((rs) => [...rs, newRow()])}>
              + Add product
            </Button>
            <p className="text-sm text-ink-soft">
              Value received: <span className="font-semibold tabular-nums text-ink">{formatMoney(value)}</span>
            </p>
          </div>
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <ButtonLink href="/warehouse/inbound" variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton pendingText="Saving…">Create GRN</SubmitButton>
      </div>
    </form>
  );
}
