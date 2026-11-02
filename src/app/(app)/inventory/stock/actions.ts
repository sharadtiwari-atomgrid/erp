"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatNumber, num } from "@/lib/format";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { nextDocumentNumber } from "@/lib/sequence";
import { adjustStock, getOnHand, InsufficientStockError } from "@/lib/stock";

/** Thrown inside a transaction to roll it back and show the message on the form. */
class StockFormError extends Error {}

const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

function revalidateStock(productIds: string[]) {
  revalidatePath("/inventory/stock");
  revalidatePath("/inventory/movements");
  revalidatePath("/inventory/products");
  revalidatePath("/inventory/warehouses", "layout");
  for (const id of productIds) revalidatePath(`/inventory/products/${id}`);
}

// ─── Adjustment ──────────────────────────────────────────────────────────────

const adjustSchema = z
  .object({
    warehouseId: f.id("Warehouse"),
    productId: f.id("Product"),
    mode: z.enum(["set", "delta"]),
    quantity: z.coerce.number({ error: "Quantity must be a number" }),
    reason: f.text("Reason"),
  })
  .refine((d) => d.mode === "delta" || d.quantity >= 0, { path: ["quantity"], message: "Counted quantity cannot be negative" })
  .refine((d) => d.mode === "set" || d.quantity !== 0, { path: ["quantity"], message: "Enter a quantity to add or remove" });

export async function adjustStockLevel(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("stock", "edit");
  const parsed = parseForm(adjustSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { warehouseId, productId, mode, quantity, reason } = parsed.data;

  try {
    await db.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId }, select: { sku: true, type: true, purchasePrice: true } });
      const warehouse = await tx.warehouse.findUnique({ where: { id: warehouseId }, select: { code: true } });
      if (!product || !warehouse) throw new StockFormError("Product or warehouse not found.");
      if (product.type === "SERVICE") throw new StockFormError("Services are not stocked.");

      const onHand = await getOnHand(tx, productId, warehouseId);
      const delta = round3(mode === "set" ? quantity - onHand : quantity);
      if (delta === 0) throw new StockFormError(`On-hand is already ${formatNumber(onHand)}; nothing to adjust.`);

      const number = await nextDocumentNumber(tx, "STOCK_ADJUSTMENT");
      await adjustStock(tx, {
        productId,
        warehouseId,
        quantity: delta,
        type: "ADJUSTMENT",
        unitCost: num(product.purchasePrice),
        referenceType: "StockAdjustment",
        reference: number,
        note: reason,
        userId: user.id,
        allowNegative: false,
      });
      await logActivity(
        {
          userId: user.id,
          entityType: "Product",
          entityId: productId,
          action: "stock_adjusted",
          message: `Stock adjustment ${number}: ${product.sku} ${delta > 0 ? "+" : ""}${formatNumber(delta)} at ${warehouse.code} (${reason})`,
        },
        tx,
      );
    });
  } catch (e) {
    if (e instanceof StockFormError || e instanceof InsufficientStockError) return { error: e.message };
    throw e;
  }

  revalidateStock([productId]);
  redirect(`/inventory/products/${productId}`);
}

// ─── Transfer ────────────────────────────────────────────────────────────────

const transferSchema = z
  .object({
    fromWarehouseId: f.id("From warehouse"),
    toWarehouseId: f.id("To warehouse"),
    note: f.optionalText(),
  })
  .refine((d) => d.fromWarehouseId !== d.toWarehouseId, { path: ["toWarehouseId"], message: "Choose a different warehouse" });

const transferLinesSchema = z
  .array(
    z.object({
      productId: z.string().min(1, "Choose a product on every line"),
      quantity: z.coerce.number().positive("Quantity must be greater than 0"),
    }),
  )
  .min(1, "Add at least one product");

export async function transferStock(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("stock", "edit");
  const parsed = parseForm(transferSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { fromWarehouseId, toWarehouseId, note } = parsed.data;

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { error: "Could not read the transfer lines." };
  }
  const lines = transferLinesSchema.safeParse(raw);
  if (!lines.success) return { error: lines.error.issues[0]?.message ?? "Invalid transfer lines." };

  // Merge repeated products into one line each.
  const quantities = new Map<string, number>();
  for (const l of lines.data) quantities.set(l.productId, round3((quantities.get(l.productId) ?? 0) + l.quantity));
  const productIds = [...quantities.keys()];

  let number: string;
  try {
    number = await db.$transaction(async (tx) => {
      const [from, to, products] = await Promise.all([
        tx.warehouse.findUnique({ where: { id: fromWarehouseId }, select: { code: true } }),
        tx.warehouse.findUnique({ where: { id: toWarehouseId }, select: { code: true } }),
        tx.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, type: true, purchasePrice: true } }),
      ]);
      if (!from || !to) throw new StockFormError("Warehouse not found.");
      if (products.length !== productIds.length) throw new StockFormError("Product not found.");
      const service = products.find((p) => p.type === "SERVICE");
      if (service) throw new StockFormError(`${service.name} is a service and cannot be transferred.`);

      const reference = await nextDocumentNumber(tx, "STOCK_TRANSFER");
      for (const p of products) {
        const quantity = quantities.get(p.id)!;
        const common = { productId: p.id, unitCost: num(p.purchasePrice), referenceType: "StockTransfer", reference, userId: user.id };
        await adjustStock(tx, { ...common, warehouseId: fromWarehouseId, quantity: -quantity, type: "TRANSFER_OUT", note: note ?? `To ${to.code}` });
        await adjustStock(tx, { ...common, warehouseId: toWarehouseId, quantity, type: "TRANSFER_IN", note: note ?? `From ${from.code}` });
      }
      await logActivity(
        {
          userId: user.id,
          entityType: "Warehouse",
          entityId: fromWarehouseId,
          action: "stock_transferred",
          message: `Stock transfer ${reference}: ${products.length} product(s) from ${from.code} to ${to.code}`,
        },
        tx,
      );
      return reference;
    });
  } catch (e) {
    if (e instanceof StockFormError || e instanceof InsufficientStockError) return { error: e.message };
    throw e;
  }

  revalidateStock(productIds);
  redirect(`/inventory/movements?q=${encodeURIComponent(number)}`);
}
