"use client";

import { useActionState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { LineItemsEditor, type ProductOption } from "@/components/line-items-editor";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/forms";
import type { LineInput } from "@/lib/totals";

export type PurchaseOrderFormValues = {
  supplierId: string;
  warehouseId: string;
  orderDate: string;
  expectedDate: string;
  notes: string | null;
  lines: LineInput[];
};

type Option = { id: string; code: string; name: string };

export function PurchaseOrderForm({
  action,
  suppliers,
  warehouses,
  products,
  initial,
  cancelHref,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  suppliers: Option[];
  warehouses: Option[];
  products: ProductOption[];
  initial: PurchaseOrderFormValues;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <Card>
        <CardHeader title="Order details" />
        <CardBody>
          <FormGrid>
            <Field label="Supplier" htmlFor="supplierId" required errors={err.supplierId}>
              <Select id="supplierId" name="supplierId" defaultValue={initial.supplierId} required>
                <option value="">Select a supplier…</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Receiving warehouse" htmlFor="warehouseId" required errors={err.warehouseId}>
              <Select id="warehouseId" name="warehouseId" defaultValue={initial.warehouseId} required>
                <option value="">Select a warehouse…</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Order date" htmlFor="orderDate" required errors={err.orderDate}>
              <Input id="orderDate" name="orderDate" type="date" defaultValue={initial.orderDate} required />
            </Field>
            <Field label="Expected delivery" htmlFor="expectedDate" errors={err.expectedDate}>
              <Input id="expectedDate" name="expectedDate" type="date" defaultValue={initial.expectedDate} />
            </Field>
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Items" />
        <CardBody>
          <LineItemsEditor products={products} priceField="purchasePrice" initialLines={initial.lines} />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Notes" />
        <CardBody>
          <Textarea name="notes" aria-label="Notes" defaultValue={initial.notes ?? ""} rows={3} placeholder="Delivery instructions, terms…" />
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton>Save purchase order</SubmitButton>
      </div>
    </form>
  );
}
