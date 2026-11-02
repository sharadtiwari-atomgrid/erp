"use client";

import { useActionState, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatNumber } from "@/lib/format";
import type { ActionState } from "@/lib/forms";

type Option = { id: string; code: string; name: string };
type ProductOption = { id: string; sku: string; name: string; unit: string };

export function AdjustStockForm({
  action,
  warehouses,
  products,
  levels,
  initial,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  warehouses: Option[];
  products: ProductOption[];
  /** On-hand keyed "productId:warehouseId". */
  levels: Record<string, number>;
  initial: { productId: string; warehouseId: string };
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};
  const [warehouseId, setWarehouseId] = useState(initial.warehouseId);
  const [productId, setProductId] = useState(initial.productId);
  const [mode, setMode] = useState<"set" | "delta">("set");
  const [quantity, setQuantity] = useState("");

  const product = products.find((p) => p.id === productId);
  const selected = Boolean(product && warehouseId);
  const onHand = levels[`${productId}:${warehouseId}`] ?? 0;
  const entered = quantity === "" ? null : Number(quantity);
  const after = entered === null || Number.isNaN(entered) ? null : mode === "set" ? entered : onHand + entered;

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <Card>
        <CardHeader title="What to adjust" />
        <CardBody>
          <FormGrid>
            <Field label="Warehouse" htmlFor="warehouseId" required errors={err.warehouseId}>
              <Select id="warehouseId" name="warehouseId" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
                <option value="">Select a warehouse…</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Product" htmlFor="productId" required errors={err.productId}>
              <Select id="productId" name="productId" value={productId} onChange={(e) => setProductId(e.target.value)} required>
                <option value="">Select a product…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          </FormGrid>
          {selected && (
            <p className="mt-4 rounded-md bg-muted px-3 py-2 text-sm text-ink-soft">
              Currently on hand: <span className="font-semibold tabular-nums text-ink">{formatNumber(onHand)} {product?.unit}</span>
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Adjustment" />
        <CardBody className="space-y-4">
          <fieldset className="flex flex-wrap gap-4">
            <legend className="sr-only">Mode</legend>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="radio" name="mode" value="set" checked={mode === "set"} onChange={() => setMode("set")} className="h-4 w-4" />
              Set counted quantity
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="radio" name="mode" value="delta" checked={mode === "delta"} onChange={() => setMode("delta")} className="h-4 w-4" />
              Add / remove quantity
            </label>
          </fieldset>
          <FormGrid>
            <Field
              label={mode === "set" ? "Counted quantity" : "Quantity to add (negative to remove)"}
              htmlFor="quantity"
              required
              errors={err.quantity}
              hint={selected && after !== null ? `On hand after: ${formatNumber(after)} ${product?.unit ?? ""}` : undefined}
            >
              <Input
                id="quantity"
                name="quantity"
                type="number"
                step="any"
                min={mode === "set" ? "0" : undefined}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
            </Field>
            <Field label="Reason" htmlFor="reason" required errors={err.reason} hint="e.g. Cycle count, damaged, found in audit">
              <Input id="reason" name="reason" required />
            </Field>
          </FormGrid>
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <ButtonLink href="/inventory/stock" variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton pendingText="Adjusting…">Save adjustment</SubmitButton>
      </div>
    </form>
  );
}
