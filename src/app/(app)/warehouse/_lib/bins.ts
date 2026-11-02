import "server-only";
import type { Tx } from "@/lib/db";
import { formatNumber, num } from "@/lib/format";
import { WarehouseError } from "./errors";
import { EPSILON, round3 } from "./qty";

/**
 * Bin quantities are an optional, secondary layer under StockLevel. They only
 * move alongside an `adjustStock` call (putaway on receipt, pick-from-bin on
 * dispatch) or as a bin-to-bin move that leaves on-hand unchanged — never
 * instead of `adjustStock`. Stock that is in a warehouse but in no bin is
 * "unbinned".
 */

/** Checks that a bin belongs to the warehouse and is active; returns its code. */
export async function assertBin(tx: Tx, binId: string, warehouseId: string): Promise<string> {
  const bin = await tx.bin.findUnique({ where: { id: binId }, select: { code: true, warehouseId: true, isActive: true } });
  if (!bin || bin.warehouseId !== warehouseId) throw new WarehouseError("The chosen bin is not in this warehouse.");
  if (!bin.isActive) throw new WarehouseError(`Bin ${bin.code} is inactive.`);
  return bin.code;
}

export async function getBinQty(tx: Tx, binId: string, productId: string): Promise<number> {
  const row = await tx.binStock.findUnique({ where: { binId_productId: { binId, productId } }, select: { quantity: true } });
  return row ? num(row.quantity) : 0;
}

/** On-hand quantity of a product in a warehouse that is not assigned to any bin. */
export async function getUnbinnedQty(tx: Tx, productId: string, warehouseId: string): Promise<number> {
  const [level, binned] = await Promise.all([
    tx.stockLevel.findUnique({ where: { productId_warehouseId: { productId, warehouseId } }, select: { quantity: true } }),
    tx.binStock.aggregate({ where: { productId, bin: { warehouseId } }, _sum: { quantity: true } }),
  ]);
  return round3(num(level?.quantity) - num(binned._sum.quantity));
}

/** Adds quantity to a bin. Call right after the matching `adjustStock` (e.g. putaway of an accepted receipt). */
export async function putIntoBin(tx: Tx, input: { binId: string; productId: string; quantity: number }) {
  if (input.quantity <= 0) return;
  await tx.binStock.upsert({
    where: { binId_productId: { binId: input.binId, productId: input.productId } },
    create: { binId: input.binId, productId: input.productId, quantity: input.quantity },
    update: { quantity: { increment: input.quantity } },
  });
}

/**
 * Removes quantity from a bin. With `strict`, throws when the bin holds less;
 * otherwise takes what is there (the bin layer is optional and may lag behind
 * on-hand). Returns the quantity actually taken.
 */
export async function takeFromBin(tx: Tx, input: { binId: string; productId: string; quantity: number; strict?: boolean }): Promise<number> {
  if (input.quantity <= 0) return 0;
  const row = await tx.binStock.findUnique({
    where: { binId_productId: { binId: input.binId, productId: input.productId } },
    include: { bin: { select: { code: true } }, product: { select: { name: true } } },
  });
  const held = row ? num(row.quantity) : 0;
  if (input.strict && held + EPSILON < input.quantity) {
    const code = row?.bin.code ?? (await tx.bin.findUnique({ where: { id: input.binId }, select: { code: true } }))?.code ?? "the bin";
    throw new WarehouseError(`Bin ${code} holds only ${formatNumber(held)} of ${row?.product.name ?? "this product"}.`);
  }
  const take = round3(Math.min(held, input.quantity));
  if (take <= 0 || !row) return 0;
  // Guarded so concurrent takes can't push the bin below zero.
  const { count } = await tx.binStock.updateMany({
    where: { id: row.id, quantity: { gte: take } },
    data: { quantity: { decrement: take } },
  });
  if (count === 0) throw new WarehouseError(`Bin ${row.bin.code} changed while you were working. Reload and try again.`);
  return take;
}

/** Checks that a bin can supply a pick without changing anything. */
export async function assertBinHas(tx: Tx, input: { binId: string; productId: string; quantity: number; productName: string }) {
  const held = await getBinQty(tx, input.binId, input.productId);
  if (held + EPSILON < input.quantity) {
    const bin = await tx.bin.findUnique({ where: { id: input.binId }, select: { code: true } });
    throw new WarehouseError(`Bin ${bin?.code ?? ""} holds only ${formatNumber(held)} of ${input.productName}.`);
  }
}
