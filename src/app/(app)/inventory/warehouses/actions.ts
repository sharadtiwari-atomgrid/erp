"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { assertBin, getUnbinnedQty, putIntoBin, takeFromBin } from "../../warehouse/_lib/bins";
import { attempt, WarehouseError } from "../../warehouse/_lib/errors";

const warehouseSchema = z.object({
  code: f.text("Code").transform((v) => v.toUpperCase()),
  name: f.text("Name"),
  branchId: f.id("Branch"),
  address: f.optionalText(),
  isActive: f.checkbox(),
});

const codeTaken: ActionState = {
  error: "Please fix the highlighted fields.",
  fieldErrors: { code: ["Another warehouse already uses this code"] },
};

export async function createWarehouse(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("warehouses", "edit");
  const parsed = parseForm(warehouseSchema, formData);
  if (!parsed.ok) return parsed.state;

  if (await db.warehouse.findUnique({ where: { code: parsed.data.code }, select: { id: true } })) return codeTaken;

  const warehouse = await db.$transaction(async (tx) => {
    const created = await tx.warehouse.create({ data: parsed.data });
    await logActivity(
      { userId: user.id, entityType: "Warehouse", entityId: created.id, action: "created", message: `Warehouse ${created.code} ${created.name} created` },
      tx,
    );
    return created;
  });

  revalidatePath("/inventory/warehouses");
  redirect(`/inventory/warehouses/${warehouse.id}`);
}

export async function updateWarehouse(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("warehouses", "edit");
  const parsed = parseForm(warehouseSchema, formData);
  if (!parsed.ok) return parsed.state;

  if (await db.warehouse.findFirst({ where: { code: parsed.data.code, id: { not: id } }, select: { id: true } })) return codeTaken;

  const warehouse = await db.warehouse.update({ where: { id }, data: parsed.data });
  await logActivity({ userId: user.id, entityType: "Warehouse", entityId: id, action: "updated", message: `Warehouse ${warehouse.code} ${warehouse.name} updated` });

  revalidatePath("/inventory/warehouses");
  revalidatePath(`/inventory/warehouses/${id}`);
  redirect(`/inventory/warehouses/${id}`);
}

// ─── Bins ────────────────────────────────────────────────────────────────────

const binSchema = z.object({
  code: f.text("Bin code").transform((v) => v.toUpperCase()),
  zone: f.optionalText(),
});

function revalidateBins(warehouseId: string) {
  revalidatePath(`/inventory/warehouses/${warehouseId}`, "layout");
}

export async function addBin(warehouseId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("warehouses", "edit");
  const parsed = parseForm(binSchema, formData);
  if (!parsed.ok) return parsed.state;

  const warehouse = await db.warehouse.findUnique({ where: { id: warehouseId }, select: { code: true } });
  if (!warehouse) return { error: "Warehouse not found." };
  if (await db.bin.findUnique({ where: { warehouseId_code: { warehouseId, code: parsed.data.code } }, select: { id: true } })) {
    return { error: "Please fix the highlighted fields.", fieldErrors: { code: ["This warehouse already has a bin with this code"] } };
  }
  await db.$transaction(async (tx) => {
    await tx.bin.create({ data: { warehouseId, ...parsed.data } });
    await logActivity(
      { userId: user.id, entityType: "Warehouse", entityId: warehouseId, action: "bin_added", message: `Bin ${parsed.data.code} added to ${warehouse.code}` },
      tx,
    );
  });
  revalidateBins(warehouseId);
  return { success: `Bin ${parsed.data.code} added.` };
}

/** Deactivates (only when empty) or reactivates a bin. */
export async function setBinActive(binId: string, active: boolean): Promise<ActionState> {
  const user = await requireUser("warehouses", "edit");
  const bin = await db.bin.findUnique({ where: { id: binId }, include: { warehouse: { select: { code: true } } } });
  if (!bin) return { error: "Bin not found." };
  if (!active) {
    const held = await db.binStock.count({ where: { binId, quantity: { gt: 0 } } });
    if (held > 0) return { error: `Move the stock out of ${bin.code} before deactivating it.` };
  }
  const { count } = await db.bin.updateMany({ where: { id: binId, isActive: !active }, data: { isActive: active } });
  if (count > 0) {
    await logActivity({
      userId: user.id,
      entityType: "Warehouse",
      entityId: bin.warehouseId,
      action: active ? "bin_activated" : "bin_deactivated",
      message: `Bin ${bin.code} in ${bin.warehouse.code} ${active ? "reactivated" : "deactivated"}`,
    });
  }
  revalidateBins(bin.warehouseId);
  return undefined;
}

const moveSchema = z
  .object({
    productId: f.id("Product"),
    fromBinId: z.string().optional().transform((v) => v || null),
    toBinId: z.string().optional().transform((v) => v || null),
    quantity: z.coerce.number({ error: "Quantity must be a number" }).positive("Quantity must be greater than 0"),
  })
  .refine((d) => d.fromBinId !== d.toBinId, { path: ["toBinId"], message: "Choose a different destination" });

/**
 * Moves stock between bins of one warehouse, or between "unbinned" and a bin.
 * On-hand is unchanged, so no stock movement is written.
 */
export async function moveBinStock(warehouseId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("stock", "edit");
  const parsed = parseForm(moveSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { productId, fromBinId, toBinId } = parsed.data;
  const quantity = Math.round(parsed.data.quantity * 1000) / 1000;

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const [warehouse, product] = await Promise.all([
        tx.warehouse.findUnique({ where: { id: warehouseId }, select: { code: true } }),
        tx.product.findUnique({ where: { id: productId }, select: { sku: true, name: true } }),
      ]);
      if (!warehouse || !product) throw new WarehouseError("Warehouse or product not found.");
      const fromCode = fromBinId ? await assertBin(tx, fromBinId, warehouseId) : "unbinned";
      const toCode = toBinId ? await assertBin(tx, toBinId, warehouseId) : "unbinned";

      if (fromBinId) {
        await takeFromBin(tx, { binId: fromBinId, productId, quantity, strict: true });
      } else {
        const unbinned = await getUnbinnedQty(tx, productId, warehouseId);
        if (unbinned + 0.0005 < quantity) throw new WarehouseError(`Only ${formatNumber(unbinned)} of ${product.name} is unbinned in ${warehouse.code}.`);
      }
      if (toBinId) await putIntoBin(tx, { binId: toBinId, productId, quantity });

      await logActivity(
        {
          userId: user.id,
          entityType: "Warehouse",
          entityId: warehouseId,
          action: "bin_move",
          message: `${formatNumber(quantity)} ${product.sku} moved ${fromCode} → ${toCode} in ${warehouse.code}`,
        },
        tx,
      );
    }),
  );
  if (!result.ok) return { error: result.error };
  revalidateBins(warehouseId);
  return { success: "Stock moved." };
}
