"use client";

import { useActionState, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatMoney, formatNumber } from "@/lib/format";
import type { ActionState } from "@/lib/forms";

type Option = { id: string; label: string };
export type SourceLineInput = { productId: string; sku: string; name: string; unit: string; sold: number; maxQty: number; unitPrice: number };
export type ProductChoice = { id: string; sku: string; name: string; unit: string };

let key = 1;

export function ReturnForm({
  action,
  customers,
  warehouses,
  products,
  source,
  defaults,
  cancelHref,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  customers: Option[];
  warehouses: Option[];
  products: ProductChoice[];
  /** Invoice / sales order the return is raised against: its lines with max quantities. */
  source: { kind: "invoice" | "salesOrder"; id: string; number: string; customerId: string; customerName: string; lines: SourceLineInput[] } | null;
  defaults: { customerId: string; warehouseId: string };
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};
  const [sourceQty, setSourceQty] = useState<Record<string, string>>(() =>
    Object.fromEntries((source?.lines ?? []).map((l) => [l.productId, String(l.maxQty)])),
  );
  const [freeRows, setFreeRows] = useState<Array<{ key: number; productId: string; quantity: string }>>(() => [{ key: key++, productId: "", quantity: "1" }]);

  const lines = source
    ? source.lines.map((l) => ({ productId: l.productId, quantity: Number(sourceQty[l.productId]) || 0 }))
    : freeRows.filter((r) => r.productId).map((r) => ({ productId: r.productId, quantity: Number(r.quantity) || 0 }));
  const credit = source ? source.lines.reduce((s, l) => s + (Number(sourceQty[l.productId]) || 0) * l.unitPrice, 0) : null;

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <input type="hidden" name="lines" value={JSON.stringify(lines)} />
      {source && <input type="hidden" name={source.kind === "invoice" ? "invoiceId" : "salesOrderId"} value={source.id} />}

      <Card>
        <CardHeader title="Return" description={source ? `Against ${source.kind === "invoice" ? "invoice" : "sales order"} ${source.number}` : undefined} />
        <CardBody>
          <FormGrid>
            <Field label="Customer" htmlFor="customerId" required errors={err.customerId}>
              {source ? (
                <>
                  <Input id="customerId" value={source.customerName} disabled />
                  <input type="hidden" name="customerId" value={source.customerId} />
                </>
              ) : (
                <Select id="customerId" name="customerId" defaultValue={defaults.customerId} required>
                  <option value="">Choose customer…</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Receiving warehouse" htmlFor="warehouseId" required errors={err.warehouseId}>
              <Select id="warehouseId" name="warehouseId" defaultValue={defaults.warehouseId} required>
                <option value="">Choose warehouse…</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Reason" htmlFor="reason" errors={err.reason} className="sm:col-span-2">
              <Input id="reason" name="reason" placeholder="Damaged in transit, wrong item, defective…" />
            </Field>
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Items to return" description={source ? "Up to the quantity sold, less anything already returned." : "Pick the products the customer is sending back."} />
        {source ? (
          <Table>
            <THead>
              <tr>
                <TH>Product</TH>
                <TH align="right">Sold</TH>
                <TH align="right">Returnable</TH>
                <TH align="right">Unit price</TH>
                <TH align="right">Return qty</TH>
              </tr>
            </THead>
            <TBody>
              {source.lines.length === 0 && <EmptyRow colSpan={5}>No returnable goods on {source.number}.</EmptyRow>}
              {source.lines.map((l) => (
                <TR key={l.productId}>
                  <TD>
                    <div className="font-medium">{l.name}</div>
                    <div className="font-mono text-xs text-ink-faint">{l.sku}</div>
                  </TD>
                  <TD align="right">{formatNumber(l.sold)}</TD>
                  <TD align="right">{formatNumber(l.maxQty)}</TD>
                  <TD align="right">{formatMoney(l.unitPrice)}</TD>
                  <TD align="right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Input
                        type="number"
                        min="0"
                        max={l.maxQty}
                        step="any"
                        value={sourceQty[l.productId] ?? "0"}
                        onChange={(e) => setSourceQty((s) => ({ ...s, [l.productId]: e.target.value }))}
                        disabled={l.maxQty <= 0}
                        className="w-24 text-right"
                        aria-label={`Quantity of ${l.name} to return`}
                      />
                      <span className="w-10 text-left text-xs text-ink-faint">{l.unit}</span>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <CardBody className="space-y-3">
            {freeRows.map((row) => (
              <div key={row.key} className="flex items-center gap-2">
                <Select
                  value={row.productId}
                  onChange={(e) => setFreeRows((rows) => rows.map((r) => (r.key === row.key ? { ...r, productId: e.target.value } : r)))}
                  aria-label="Product"
                >
                  <option value="">Choose product…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} — {p.name}
                    </option>
                  ))}
                </Select>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={row.quantity}
                  onChange={(e) => setFreeRows((rows) => rows.map((r) => (r.key === row.key ? { ...r, quantity: e.target.value } : r)))}
                  className="w-28 text-right"
                  aria-label="Quantity"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={freeRows.length === 1}
                  onClick={() => setFreeRows((rows) => rows.filter((r) => r.key !== row.key))}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={() => setFreeRows((rows) => [...rows, { key: key++, productId: "", quantity: "1" }])}>
              Add line
            </Button>
          </CardBody>
        )}
        {credit !== null && (
          <div className="border-t border-line px-5 py-3 text-right text-sm">
            Estimated credit <span className="font-semibold tabular-nums">{formatMoney(credit)}</span>
            <span className="ml-1 text-xs text-ink-faint">(price paid incl. GST)</span>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Notes" />
        <CardBody>
          <Textarea name="notes" aria-label="Notes" />
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton>Create return</SubmitButton>
      </div>
    </form>
  );
}
