"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ItemType, ProductType, SupplyMode } from "@/generated/prisma/enums";
import { logActivity } from "@/lib/activity";
import { diff, recordChange } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { PRODUCT_CLASSES, PRODUCT_FUNNELS } from "./_item-meta";
import { describeProductRename, renameProductEverywhere } from "./rename";

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const productSchema = z.object({
  sku: f.text("SKU").transform((v) => v.toUpperCase()),
  name: f.text("Name"),
  description: f.optionalText(),
  type: z.enum(ProductType),
  itemType: z.enum(ItemType, { error: "Choose an item type" }),
  supplyMode: z.enum(SupplyMode, { error: "Choose a supply mode" }),
  qcRequired: f.checkbox(),
  weightKg: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.coerce.number({ error: "Weight must be a number" }).min(0, "Weight cannot be negative").nullable(),
  ),
  unit: f.text("Unit"),
  hsnCode: f.optionalText(),
  casNo: f.optionalText(),
  productClass: z.preprocess(emptyToNull, z.enum(PRODUCT_CLASSES, { error: "Choose a valid class" }).nullable()),
  funnel: z.preprocess(emptyToNull, z.enum(PRODUCT_FUNNELS, { error: "Choose B2B or B2C" }).nullable()),
  categoryId: f.optionalText(),
  salePrice: f.number({ label: "Sale price" }),
  purchasePrice: f.number({ label: "Purchase price" }),
  taxRate: f.number({ label: "GST rate" }).max(100, "GST rate must be at most 100"),
  reorderLevel: f.number({ label: "Reorder level" }),
  isActive: f.checkbox(),
})
  .refine((d) => (d.type === "SERVICE") === (d.itemType === "SERVICE"), {
    path: ["itemType"],
    message: "Use item type Service for service products (and only for them)",
  });

/** Other names (inward / outward sheet spellings): one per line, "|" also separates; de-duplicated, never the product's own name. */
function readAliases(raw: FormDataEntryValue | null, name: string): string[] {
  const seen = new Set([name.trim().toLowerCase()]);
  const out: string[] = [];
  for (const part of String(raw ?? "").split(/[\n|]+/)) {
    const a = part.replace(/\s+/g, " ").trim();
    if (a && !seen.has(a.toLowerCase())) {
      seen.add(a.toLowerCase());
      out.push(a);
    }
  }
  return out;
}

const skuTaken: ActionState = {
  error: "Please fix the highlighted fields.",
  fieldErrors: { sku: ["Another product already uses this SKU"] },
};

export async function createProduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("products", "edit");
  const parsed = parseForm(productSchema, formData);
  if (!parsed.ok) return parsed.state;

  if (await db.product.findUnique({ where: { sku: parsed.data.sku }, select: { id: true } })) return skuTaken;
  const aliases = readAliases(formData.get("aliases"), parsed.data.name);

  const product = await db.$transaction(async (tx) => {
    const created = await tx.product.create({ data: { ...parsed.data, aliases } });
    await logActivity(
      { userId: user.id, entityType: "Product", entityId: created.id, action: "created", message: `Product ${created.sku} ${created.name} created` },
      tx,
    );
    return created;
  });

  revalidatePath("/inventory/products");
  redirect(`/inventory/products/${product.id}`);
}

export async function updateProduct(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("products", "edit");
  const parsed = parseForm(productSchema, formData);
  if (!parsed.ok) return parsed.state;

  if (await db.product.findFirst({ where: { sku: parsed.data.sku, id: { not: id } }, select: { id: true } })) return skuTaken;

  if (parsed.data.type === "SERVICE") {
    const held = await db.stockLevel.count({ where: { productId: id, quantity: { not: 0 } } });
    if (held > 0) {
      return {
        error: "Please fix the highlighted fields.",
        fieldErrors: { type: ["Bring stock to zero before changing this product to a service"] },
      };
    }
  }

  const before = await db.product.findUnique({ where: { id } });
  if (!before) return { error: "This product no longer exists." };
  const aliases = readAliases(formData.get("aliases"), parsed.data.name);
  const renamed = parsed.data.name !== before.name;
  // Another product with the same old name keeps the text on the records.
  const shared = renamed ? await db.product.count({ where: { name: before.name, id: { not: id } } }) : 0;
  let note = "";
  const product = await db.$transaction(async (tx) => {
    const after = await tx.product.update({ where: { id }, data: { ...parsed.data, aliases } });
    if (renamed && !shared) note = describeProductRename(await renameProductEverywhere(tx, before.name, after.name));
    else if (renamed) note = "Another product has the old name too, so Domestic B2B records were left unchanged.";
    await recordChange(
      {
        userId: user.id,
        entityType: "Product",
        entityId: id,
        action: renamed ? "renamed" : "updated",
        message: renamed ? `Product renamed from ${before.name} to ${after.name}. ${note}` : `Product ${after.sku} ${after.name} updated`,
        changes: diff(before, after),
      },
      tx,
    );
    return after;
  });

  revalidatePath("/inventory/products");
  revalidatePath(`/inventory/products/${id}`);
  revalidatePath("/inventory/stock");
  if (renamed) {
    revalidatePath("/b2b", "layout");
    redirect(`/inventory/products/${product.id}?renamed=${encodeURIComponent(note)}`);
  }
  redirect(`/inventory/products/${id}`);
}
