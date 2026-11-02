"use client";

import { useActionState, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/forms";
import { PRIORITY_OPTIONS } from "../_components/badges";

export type OrderProductOption = { id: string; sku: string; name: string; unit: string; supplyMode: string };
export type OrderBomOption = { id: string; productId: string; code: string; version: number; isDefault: boolean; outputQty: number };

export type OrderFormValues = {
  productId: string;
  bomId: string;
  quantity: number | string;
  mode: string;
  warehouseId: string;
  dueDate: string;
  priority: number;
  notes: string | null;
  salesOrderId: string | null;
  salesOrderLineId: string | null;
};

const makeMode = (supplyMode?: string) => (supplyMode === "MTO" || supplyMode === "ATO" ? supplyMode : "MTS");
const defaultBom = (boms: OrderBomOption[], productId: string) =>
  (boms.find((b) => b.productId === productId && b.isDefault) ?? boms.find((b) => b.productId === productId))?.id ?? "";

export function ProductionOrderForm({
  action,
  initial,
  products,
  boms,
  warehouses,
  cancelHref,
  linkedTo,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial: OrderFormValues;
  products: OrderProductOption[];
  boms: OrderBomOption[];
  warehouses: Array<{ id: string; code: string; name: string }>;
  cancelHref: string;
  /** Shown when the order is being created for a sales order line. */
  linkedTo?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};
  const [productId, setProductId] = useState(initial.productId);
  const [bomId, setBomId] = useState(initial.bomId || defaultBom(boms, initial.productId));
  const [mode, setMode] = useState(initial.mode || makeMode(products.find((p) => p.id === initial.productId)?.supplyMode));
  const productBoms = boms.filter((b) => b.productId === productId);
  const product = products.find((p) => p.id === productId);

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <input type="hidden" name="salesOrderId" value={initial.salesOrderId ?? ""} />
      <input type="hidden" name="salesOrderLineId" value={initial.salesOrderLineId ?? ""} />
      {linkedTo && (
        <div className="rounded-md border border-brand-100 bg-brand-50 px-3 py-2 text-sm text-brand-900">Linked to {linkedTo}</div>
      )}
      <Card>
        <CardHeader title="What to make" />
        <CardBody>
          <FormGrid>
            <Field label="Product" htmlFor="productId" required errors={err.productId} className="sm:col-span-2">
              <Select
                id="productId"
                name="productId"
                value={productId}
                required
                disabled={Boolean(initial.salesOrderLineId)}
                onChange={(e) => {
                  const id = e.target.value;
                  setProductId(id);
                  setBomId(defaultBom(boms, id));
                  setMode(makeMode(products.find((p) => p.id === id)?.supplyMode));
                }}
              >
                <option value="">Select a product…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.name} ({p.supplyMode})
                  </option>
                ))}
              </Select>
              {initial.salesOrderLineId && <input type="hidden" name="productId" value={productId} />}
            </Field>
            <Field
              label="Bill of materials"
              htmlFor="bomId"
              required
              errors={err.bomId}
              hint={productId && productBoms.length === 0 ? "This product has no active BOM. Create one in Hub settings first." : undefined}
            >
              <Select id="bomId" name="bomId" value={bomId} onChange={(e) => setBomId(e.target.value)} required>
                <option value="">{productId ? "Select a BOM…" : "Pick a product first"}</option>
                {productBoms.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code} v{b.version}
                    {b.isDefault ? " (default)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Quantity" htmlFor="quantity" required errors={err.quantity} hint={product ? product.unit : undefined}>
              <Input id="quantity" name="quantity" type="number" min="0.001" step="any" defaultValue={initial.quantity} required />
            </Field>
            <Field label="Mode" htmlFor="mode" required errors={err.mode} hint="Defaults to the product's supply mode">
              <Select id="mode" name="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="MTS">MTS — make to stock</option>
                <option value="MTO">MTO — make to order</option>
                <option value="ATO">ATO — assemble to order</option>
              </Select>
            </Field>
            <Field label="Warehouse" htmlFor="warehouseId" required errors={err.warehouseId} hint="Components are consumed from, and output received into, this warehouse">
              <Select id="warehouseId" name="warehouseId" defaultValue={initial.warehouseId} required>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </Select>
            </Field>
          </FormGrid>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Planning" />
        <CardBody>
          <FormGrid>
            <Field label="Due date" htmlFor="dueDate" errors={err.dueDate}>
              <Input id="dueDate" name="dueDate" type="date" defaultValue={initial.dueDate} />
            </Field>
            <Field label="Priority" htmlFor="priority" required errors={err.priority} hint="The auto-scheduler plans higher priorities first">
              <Select id="priority" name="priority" defaultValue={String(initial.priority)}>
                {PRIORITY_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Notes" htmlFor="notes" errors={err.notes} className="sm:col-span-2">
              <Textarea id="notes" name="notes" defaultValue={initial.notes ?? ""} rows={3} />
            </Field>
          </FormGrid>
        </CardBody>
      </Card>
      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton>Save production order</SubmitButton>
      </div>
    </form>
  );
}
