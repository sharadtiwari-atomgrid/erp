"use client";

import { useActionState, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import type { ActionState } from "@/lib/forms";

type Option = { id: string; code: string; name: string };
type ProductOption = { id: string; sku: string; name: string; unit: string };
type Row = { key: number; productId: string; quantity: string };

let nextKey = 1;
const newRow = (): Row => ({ key: nextKey++, productId: "", quantity: "1" });

export function TransferStockForm({
  action,
  warehouses,
  products,
  levels,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  warehouses: Option[];
  products: ProductOption[];
  /** On-hand keyed "productId:warehouseId". */
  levels: Record<string, number>;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [rows, setRows] = useState<Row[]>(() => [newRow()]);

  const unitOf = new Map(products.map((p) => [p.id, p.unit]));
  const lines = rows.filter((r) => r.productId).map((r) => ({ productId: r.productId, quantity: Number(r.quantity) || 0 }));

  function update(key: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      <Card>
        <CardHeader title="Warehouses" />
        <CardBody>
          <FormGrid>
            <Field label="From warehouse" htmlFor="fromWarehouseId" required errors={err.fromWarehouseId}>
              <Select id="fromWarehouseId" name="fromWarehouseId" value={fromId} onChange={(e) => setFromId(e.target.value)} required>
                <option value="">Select a warehouse…</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="To warehouse" htmlFor="toWarehouseId" required errors={err.toWarehouseId}>
              <Select id="toWarehouseId" name="toWarehouseId" value={toId} onChange={(e) => setToId(e.target.value)} required>
                <option value="">Select a warehouse…</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id} disabled={w.id === fromId}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Note" htmlFor="note" errors={err.note} className="sm:col-span-2">
              <Input id="note" name="note" placeholder="Optional, e.g. replenish Pune depot" />
            </Field>
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Products" />
        <CardBody>
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="min-w-full divide-y divide-line text-sm">
              <thead className="bg-muted/60 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                <tr>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="w-32 px-3 py-2 text-right">Available</th>
                  <th className="w-32 px-3 py-2 text-right">Qty</th>
                  <th className="w-10 px-2 py-2" aria-label="Remove" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => {
                  const available = fromId && row.productId ? (levels[`${row.productId}:${fromId}`] ?? 0) : null;
                  const short = available !== null && Number(row.quantity) > available;
                  return (
                    <tr key={row.key}>
                      <td className="min-w-64 px-3 py-2">
                        <Select value={row.productId} onChange={(e) => update(row.key, { productId: e.target.value })} aria-label="Product">
                          <option value="">Select a product…</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.sku} — {p.name}
                            </option>
                          ))}
                        </Select>
                      </td>
                      <td className={cn("px-3 py-2 text-right tabular-nums", short ? "text-red-600" : "text-ink-soft")}>
                        {available === null ? "—" : `${formatNumber(available)} ${unitOf.get(row.productId) ?? ""}`}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          className="text-right"
                          value={row.quantity}
                          onChange={(e) => update(row.key, { quantity: e.target.value })}
                          aria-label="Quantity"
                          aria-invalid={short || undefined}
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
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => setRows((rs) => [...rs, newRow()])}>
            + Add product
          </Button>
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <ButtonLink href="/inventory/stock" variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton pendingText="Transferring…">Transfer stock</SubmitButton>
      </div>
    </form>
  );
}
