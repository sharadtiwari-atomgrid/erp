"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ItemType, ProductType, SupplyMode } from "@/generated/prisma/enums";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { f, parseForm, type ActionState } from "@/lib/forms";

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

const skuTaken: ActionState = {
  error: "Please fix the highlighted fields.",
  fieldErrors: { sku: ["Another product already uses this SKU"] },
};

export async function createProduct(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("products", "edit");
  const parsed = parseForm(productSchema, formData);
  if (!parsed.ok) return parsed.state;

  if (await db.product.findUnique({ where: { sku: parsed.data.sku }, select: { id: true } })) return skuTaken;

  const product = await db.$transaction(async (tx) => {
    const created = await tx.product.create({ data: parsed.data });
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

  const product = await db.product.update({ where: { id }, data: parsed.data });
  await logActivity({ userId: user.id, entityType: "Product", entityId: id, action: "updated", message: `Product ${product.sku} ${product.name} updated` });

  revalidatePath("/inventory/products");
  revalidatePath(`/inventory/products/${id}`);
  revalidatePath("/inventory/stock");
  redirect(`/inventory/products/${id}`);
}
