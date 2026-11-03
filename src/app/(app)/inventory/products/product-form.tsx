"use client";

import { useActionState, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/forms";
import { ITEM_TYPES, PRODUCT_CLASSES, PRODUCT_FUNNELS, SUPPLY_MODES, type ItemTypeKey, type SupplyModeKey } from "./_item-meta";

export type ProductFormValues = {
  sku: string;
  name: string;
  description: string | null;
  type: "GOODS" | "SERVICE";
  itemType: ItemTypeKey;
  supplyMode: SupplyModeKey;
  qcRequired: boolean;
  weightKg: number | null;
  unit: string;
  hsnCode: string | null;
  casNo: string | null;
  productClass: string | null;
  funnel: string | null;
  aliases: string[];
  categoryId: string | null;
  salePrice: number;
  purchasePrice: number;
  taxRate: number;
  reorderLevel: number;
  isActive: boolean;
};

export function ProductForm({
  action,
  categories,
  initial,
  cancelHref,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  categories: Array<{ id: string; name: string }>;
  initial?: ProductFormValues;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};
  const [itemType, setItemType] = useState<ItemTypeKey>(initial?.itemType ?? "TRADING");
  const [supplyMode, setSupplyMode] = useState<SupplyModeKey>(initial?.supplyMode ?? "BUY");

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <Card>
        <CardHeader title="Details" />
        <CardBody>
          <FormGrid>
            <Field label="SKU" htmlFor="sku" required errors={err.sku} hint="Unique product code">
              <Input id="sku" name="sku" defaultValue={initial?.sku} required className="font-mono uppercase" />
            </Field>
            <Field label="Name" htmlFor="name" required errors={err.name}>
              <Input id="name" name="name" defaultValue={initial?.name} required />
            </Field>
            <Field label="Type" htmlFor="type" errors={err.type} hint="Services are never stocked">
              <Select
                id="type"
                name="type"
                defaultValue={initial?.type ?? "GOODS"}
                onChange={(e) => {
                  if (e.target.value === "SERVICE") setItemType("SERVICE");
                  else if (itemType === "SERVICE") setItemType("TRADING");
                }}
              >
                <option value="GOODS">Goods</option>
                <option value="SERVICE">Service</option>
              </Select>
            </Field>
            <Field label="Category" htmlFor="categoryId" errors={err.categoryId}>
              <Select id="categoryId" name="categoryId" defaultValue={initial?.categoryId ?? ""}>
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Unit" htmlFor="unit" required errors={err.unit} hint="e.g. pcs, kg, box, hr">
              <Input id="unit" name="unit" defaultValue={initial?.unit ?? "pcs"} required />
            </Field>
            <Field label="HSN / SAC code" htmlFor="hsnCode" errors={err.hsnCode}>
              <Input id="hsnCode" name="hsnCode" defaultValue={initial?.hsnCode ?? ""} maxLength={8} />
            </Field>
            <Field label="Description" htmlFor="description" errors={err.description} className="sm:col-span-2">
              <Textarea id="description" name="description" defaultValue={initial?.description ?? ""} />
            </Field>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="isActive" defaultChecked={initial?.isActive ?? true} className="h-4 w-4 rounded border-line" />
                Active
              </label>
            </div>
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Classification & handling" />
        <CardBody>
          <FormGrid>
            <Field label="Item type" htmlFor="itemType" errors={err.itemType} hint={ITEM_TYPES[itemType].hint}>
              <Select id="itemType" name="itemType" value={itemType} onChange={(e) => setItemType(e.target.value as ItemTypeKey)}>
                {Object.entries(ITEM_TYPES).map(([value, t]) => (
                  <option key={value} value={value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Supply mode" htmlFor="supplyMode" errors={err.supplyMode} hint={SUPPLY_MODES[supplyMode].hint}>
              <Select id="supplyMode" name="supplyMode" value={supplyMode} onChange={(e) => setSupplyMode(e.target.value as SupplyModeKey)}>
                {Object.entries(SUPPLY_MODES).map(([value, m]) => (
                  <option key={value} value={value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Weight (kg)" htmlFor="weightKg" errors={err.weightKg} hint="Per unit; used for packing and freight">
              <Input id="weightKg" name="weightKg" type="number" min="0" step="0.001" defaultValue={initial?.weightKg ?? ""} />
            </Field>
            <div className="flex flex-col justify-end pb-2">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" name="qcRequired" defaultChecked={initial?.qcRequired ?? false} className="h-4 w-4 rounded border-line" />
                Quality check on receipt
              </label>
              <p className="mt-1 text-xs text-ink-faint">Inbound receipts must pass QC before this item is added to stock.</p>
            </div>
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Domestic B2B master" description="How this material appears on Fresh POs, Domestic MIS and the batch registers" />
        <CardBody>
          <FormGrid>
            <Field label="CAS No." htmlFor="casNo" errors={err.casNo}>
              <Input id="casNo" name="casNo" defaultValue={initial?.casNo ?? ""} placeholder="e.g. 0000-00-0" />
            </Field>
            <Field label="Class" htmlFor="productClass" errors={err.productClass}>
              <Select id="productClass" name="productClass" defaultValue={initial?.productClass ?? ""}>
                <option value="">Not set</option>
                {PRODUCT_CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Funnel" htmlFor="funnel" errors={err.funnel}>
              <Select id="funnel" name="funnel" defaultValue={initial?.funnel ?? ""}>
                <option value="">Not set</option>
                {PRODUCT_FUNNELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Other names (aliases)" htmlFor="aliases" errors={err.aliases} hint="Spellings used on inward / outward sheets, one per line">
              <Textarea id="aliases" name="aliases" rows={3} defaultValue={(initial?.aliases ?? []).join("\n")} />
            </Field>
          </FormGrid>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Pricing & stock" />
        <CardBody>
          <FormGrid>
            <Field label="Sale price" htmlFor="salePrice" errors={err.salePrice} hint="Before GST">
              <Input id="salePrice" name="salePrice" type="number" min="0" step="0.01" defaultValue={initial?.salePrice ?? 0} />
            </Field>
            <Field label="Purchase price" htmlFor="purchasePrice" errors={err.purchasePrice} hint="Used for stock value and new POs">
              <Input id="purchasePrice" name="purchasePrice" type="number" min="0" step="0.01" defaultValue={initial?.purchasePrice ?? 0} />
            </Field>
            <Field label="GST rate (%)" htmlFor="taxRate" errors={err.taxRate}>
              <Input id="taxRate" name="taxRate" type="number" min="0" max="100" step="0.01" defaultValue={initial?.taxRate ?? 18} />
            </Field>
            <Field label="Reorder level" htmlFor="reorderLevel" errors={err.reorderLevel} hint="Flag as low stock at or below this quantity; 0 turns it off">
              <Input id="reorderLevel" name="reorderLevel" type="number" min="0" step="any" defaultValue={initial?.reorderLevel ?? 0} />
            </Field>
          </FormGrid>
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton>Save product</SubmitButton>
      </div>
    </form>
  );
}
