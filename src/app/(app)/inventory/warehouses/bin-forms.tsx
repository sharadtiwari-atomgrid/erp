"use client";

import { useActionState, useState } from "react";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatNumber } from "@/lib/format";
import type { ActionState } from "@/lib/forms";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/** Inline "add bin" form on the warehouse page. */
export function AddBinForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-3">
      <FormMessage state={state} />
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Bin code" htmlFor="bin-code" errors={err.code} className="w-36">
          <Input id="bin-code" name="code" placeholder="A-01-03" required className="font-mono uppercase" />
        </Field>
        <Field label="Zone" htmlFor="bin-zone" errors={err.zone} className="w-48">
          <Input id="bin-zone" name="zone" placeholder="Optional" />
        </Field>
        <SubmitButton variant="secondary" pendingText="Adding…">
          Add bin
        </SubmitButton>
      </div>
    </form>
  );
}

type ProductOption = { id: string; sku: string; name: string; unit: string };

/** Moves stock between bins (or to/from "unbinned") without changing on-hand. */
export function MoveBinStockForm({
  action,
  products,
  bins,
  binStock,
  unbinned,
}: {
  action: Action;
  products: ProductOption[];
  bins: Array<{ id: string; code: string }>;
  /** Quantity per "binId:productId". */
  binStock: Record<string, number>;
  /** Unbinned quantity per productId. */
  unbinned: Record<string, number>;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};
  const [productId, setProductId] = useState("");
  const [fromBinId, setFromBinId] = useState("");
  const unit = products.find((p) => p.id === productId)?.unit ?? "";
  const held = (binId: string) => (binId ? (binStock[`${binId}:${productId}`] ?? 0) : (unbinned[productId] ?? 0));

  return (
    <form action={formAction} className="space-y-3">
      <FormMessage state={state} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Product" htmlFor="mv-product" errors={err.productId}>
          <Select id="mv-product" name="productId" value={productId} onChange={(e) => setProductId(e.target.value)} required>
            <option value="">Select a product…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From" htmlFor="mv-from" errors={err.fromBinId}>
          <Select id="mv-from" name="fromBinId" value={fromBinId} onChange={(e) => setFromBinId(e.target.value)}>
            <option value="">Unbinned{productId ? ` (${formatNumber(held(""))})` : ""}</option>
            {bins.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code}
                {productId ? ` (${formatNumber(held(b.id))})` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="To" htmlFor="mv-to" errors={err.toBinId}>
          <Select id="mv-to" name="toBinId" defaultValue={bins[0]?.id ?? ""}>
            <option value="">Unbinned</option>
            {bins.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={`Quantity${unit ? ` (${unit})` : ""}`} htmlFor="mv-qty" errors={err.quantity}>
          <Input id="mv-qty" name="quantity" type="number" min="0" step="any" required className="text-right" />
        </Field>
      </div>
      <div className="flex justify-end">
        <SubmitButton pendingText="Moving…">Move stock</SubmitButton>
      </div>
    </form>
  );
}
