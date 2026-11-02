import "server-only";
import { revalidatePath } from "next/cache";
import { db, type Tx } from "@/lib/db";
import { formatNumber, num } from "@/lib/format";
import type { ActionState } from "@/lib/forms";
import { InsufficientStockError, releaseStock, reserveStock } from "@/lib/stock";
import { componentRequirement, round3 } from "./bom-math";

/** Thrown inside a transaction to roll it back and show the message to the user. */
export class MfgError extends Error {}

/** Runs a write and turns expected business-rule failures into `{ error }`. */
export async function attempt(fn: () => Promise<unknown>): Promise<ActionState> {
  try {
    await fn();
    return undefined;
  } catch (e) {
    if (e instanceof MfgError || e instanceof InsufficientStockError) return { error: e.message };
    throw e;
  }
}

/** Order statuses that still need production. */
export const OPEN_ORDER_STATUSES = ["DRAFT", "SCHEDULED", "IN_PROGRESS"] as const;
/** Batch statuses that have been through QC (components consumed). */
export const QC_DONE_BATCH_STATUSES = ["PASSED", "PARTIALLY_PASSED", "FAILED"] as const;
/** Batch statuses still on the shop floor. */
export const OPEN_BATCH_STATUSES = ["PLANNED", "IN_PROGRESS", "QC_PENDING"] as const;

/**
 * Optimistic lock on a production order: succeeds only if nobody changed the
 * order since `updatedAt` was read. Use it to make read-check-write steps safe
 * against double clicks and concurrent users.
 */
export async function lockOrder(tx: Tx, id: string, updatedAt: Date) {
  const { count } = await tx.productionOrder.updateMany({ where: { id, updatedAt }, data: { updatedAt: new Date() } });
  if (count === 0) throw new MfgError("This production order was just changed by someone else. Reload and try again.");
}

/**
 * Default warehouse for production: the plant stores of the first active
 * production unit's branch (preferring a warehouse named like a plant or
 * factory), else the first active warehouse.
 */
export async function getPlantWarehouseId(): Promise<string | null> {
  const unit = await db.productionUnit.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" }, select: { branchId: true } });
  const warehouses = await db.warehouse.findMany({
    where: { isActive: true, ...(unit && { branchId: unit.branchId }) },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, code: true },
  });
  const plant = warehouses.find((w) => /plant|factory|production|stores/i.test(`${w.name} ${w.code}`));
  return plant?.id ?? warehouses[0]?.id ?? null;
}

/**
 * Component reservations are recorded as an Activity pair on the order
 * ("components_reserved" / "components_released"), because the schema has no
 * reservation table. Reservation is all-or-nothing for the full order
 * quantity, so the amount still reserved can always be recomputed from the
 * BOM and the batches already consumed.
 */
export const RESERVED_ACTION = "components_reserved";
export const RELEASED_ACTION = "components_released";

export async function hasReservation(tx: Tx | typeof db, orderId: string): Promise<boolean> {
  const last = await tx.activity.findFirst({
    where: { entityType: "ProductionOrder", entityId: orderId, action: { in: [RESERVED_ACTION, RELEASED_ACTION] } },
    orderBy: { createdAt: "desc" },
    select: { action: true },
  });
  return last?.action === RESERVED_ACTION;
}

type Numeric = number | { toString(): string };
type BomForMath = { outputQty: Numeric; lines: Array<{ componentId: string; quantity: Numeric; scrapPct: Numeric }> };

/** Quantity of each component still held in reservation for an order. */
export function reservedRemaining(bom: BomForMath, orderQty: number, consumedBatchQty: number): Map<string, number> {
  const out = new Map<string, number>();
  const outputQty = num(bom.outputQty);
  for (const line of bom.lines) {
    const total = componentRequirement(num(line.quantity), num(line.scrapPct), outputQty, orderQty);
    const used = componentRequirement(num(line.quantity), num(line.scrapPct), outputQty, consumedBatchQty);
    const left = round3(total - used);
    if (left > 0) out.set(line.componentId, round3((out.get(line.componentId) ?? 0) + left));
  }
  return out;
}

/** Sum of batch quantities that have been through QC (and so consumed components). */
export async function consumedBatchQty(tx: Tx | typeof db, orderId: string): Promise<number> {
  const agg = await tx.productionBatch.aggregate({
    where: { productionOrderId: orderId, status: { in: [...QC_DONE_BATCH_STATUSES] } },
    _sum: { quantity: true },
  });
  return num(agg._sum.quantity);
}

/**
 * Releases whatever is still reserved for an order (if anything) and records
 * the release. Call inside the transaction that closes, cancels or
 * unschedules the order.
 */
export async function releaseOrderReservation(tx: Tx, orderId: string, userId: string, reason: string) {
  if (!(await hasReservation(tx, orderId))) return;
  const order = await tx.productionOrder.findUniqueOrThrow({
    where: { id: orderId },
    select: { number: true, quantity: true, warehouseId: true, bom: { select: { outputQty: true, lines: true } } },
  });
  const left = reservedRemaining(order.bom, num(order.quantity), await consumedBatchQty(tx, orderId));
  for (const [productId, quantity] of left) await releaseStock(tx, { productId, warehouseId: order.warehouseId, quantity });
  await tx.activity.create({
    data: {
      userId,
      entityType: "ProductionOrder",
      entityId: orderId,
      action: RELEASED_ACTION,
      message: `Component reservations for ${order.number} released (${reason})`,
    },
  });
}

/** Deletes calendar slots of an order that have not started yet, freeing machine time. */
export async function clearFutureSlots(tx: Tx, orderId: string) {
  await tx.productionScheduleSlot.deleteMany({ where: { productionOrderId: orderId, start: { gt: new Date() } } });
}

export function revalidateOrder(id: string) {
  revalidatePath("/manufacturing/orders");
  revalidatePath(`/manufacturing/orders/${id}`);
  revalidatePath("/manufacturing/schedule");
  revalidatePath("/manufacturing/needs");
  revalidatePath("/manufacturing/batches");
}

export function revalidateStockPages() {
  revalidatePath("/inventory/stock");
  revalidatePath("/inventory/movements");
  revalidatePath("/inventory/products");
  revalidatePath("/dashboard");
}

/** Available (in hand minus reserved) per product in one warehouse. */
export async function availableByProduct(warehouseId: string, productIds: string[]): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const levels = await db.stockLevel.findMany({
    where: { warehouseId, productId: { in: productIds } },
    select: { productId: true, quantity: true, reservedQty: true },
  });
  return new Map(levels.map((l) => [l.productId, round3(num(l.quantity) - num(l.reservedQty))]));
}

/** True for Prisma's unique-constraint violation (P2002). */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "P2002";
}

/** Reads repeated checkbox values (e.g. working days) as ISO weekdays 1–7. */
export function readWeekdays(formData: FormData, name = "workingDays"): number[] {
  const days = formData
    .getAll(name)
    .map((v) => Number(v))
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  return [...new Set(days)].sort((a, b) => a - b);
}

/**
 * Reserves every component still needed by an order (all-or-nothing): if any
 * component is short, nothing is reserved and an MfgError lists the gaps.
 */
export async function reserveOrderComponents(tx: Tx, orderId: string, userId: string) {
  if (await hasReservation(tx, orderId)) throw new MfgError("Components are already reserved for this order.");
  const order = await tx.productionOrder.findUniqueOrThrow({
    where: { id: orderId },
    select: { number: true, quantity: true, warehouseId: true, bom: { select: { outputQty: true, lines: true } } },
  });
  const needed = reservedRemaining(order.bom, num(order.quantity), await consumedBatchQty(tx, orderId));
  const short: string[] = [];
  for (const [productId, quantity] of needed) {
    const got = await reserveStock(tx, { productId, warehouseId: order.warehouseId, quantity });
    if (got + 1e-9 < quantity) {
      const p = await tx.product.findUniqueOrThrow({ where: { id: productId }, select: { name: true, type: true } });
      if (p.type !== "SERVICE") short.push(`${p.name} (${formatNumber(round3(quantity - got))} short)`);
    }
  }
  if (short.length > 0) throw new MfgError(`Not enough available stock to reserve: ${short.join(", ")}. Nothing was reserved.`);
  await tx.activity.create({
    data: { userId, entityType: "ProductionOrder", entityId: orderId, action: RESERVED_ACTION, message: `Components reserved for ${order.number}` },
  });
}
