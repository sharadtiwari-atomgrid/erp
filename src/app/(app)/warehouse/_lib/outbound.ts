import "server-only";
import type { OutboundStatus } from "@/generated/prisma/enums";
import type { Tx } from "@/lib/db";
import { formatNumber, num } from "@/lib/format";
import { allocateStock, reserveStock } from "@/lib/stock";
import { assertBin, assertBinHas } from "./bins";
import { WarehouseError } from "./errors";
import { EPSILON, readQty, round3 } from "./qty";

/** Outbound orders that still hold (or will hold) stock for their sales order lines. */
export const OPEN_OUTBOUND: OutboundStatus[] = ["PENDING", "PICKING", "PICKED", "PACKING", "PACKED"];

export type SalesLineRemainder = {
  lineId: string;
  productId: string;
  ordered: number;
  delivered: number;
  reserved: number;
  /** Quantity on open (not dispatched, not cancelled) outbound orders. */
  onOpenOutbound: number;
  /** Still to be put on an outbound order. */
  remainder: number;
};

/** Per sales-order line: ordered, delivered, on open outbounds and the remainder still to ship. */
export async function salesLineRemainders(tx: Tx, salesOrderId: string): Promise<SalesLineRemainder[]> {
  const lines = await tx.salesOrderLine.findMany({
    where: { salesOrderId },
    orderBy: { position: "asc" },
    select: {
      id: true,
      productId: true,
      quantity: true,
      deliveredQty: true,
      reservedQty: true,
      outboundLines: { where: { outbound: { status: { in: OPEN_OUTBOUND } } }, select: { quantity: true } },
    },
  });
  return lines.map((l) => {
    const ordered = num(l.quantity);
    const delivered = num(l.deliveredQty);
    const onOpenOutbound = round3(l.outboundLines.reduce((s, o) => s + num(o.quantity), 0));
    return {
      lineId: l.id,
      productId: l.productId,
      ordered,
      delivered,
      reserved: num(l.reservedQty),
      onOpenOutbound,
      remainder: Math.max(0, round3(ordered - delivered - onOpenOutbound)),
    };
  });
}

/**
 * Records picked quantities on the given outbound orders' lines from
 * `pick_<lineId>` / `bin_<lineId>` form fields. Picked quantity is moved into
 * the allocated bucket (`allocateStock`). When a pick exceeds what the sales
 * order line has reserved, the shortfall is reserved first, so stock promised
 * to other orders can't be picked. Returns the number of lines with a pick.
 */
export async function recordPicks(tx: Tx, outboundIds: string[], formData: FormData): Promise<{ picked: number; changed: number }> {
  const outbounds = await tx.outboundOrder.findMany({
    where: { id: { in: outboundIds } },
    include: { lines: { include: { product: { select: { name: true } } } } },
  });

  let picked = 0;
  let changed = 0;
  for (const outbound of outbounds) {
    for (const line of outbound.lines) {
      const qty = readQty(formData, `pick_${line.id}`);
      if (qty === null) throw new WarehouseError(`Enter a valid picked quantity for ${line.product.name}.`);
      const ordered = num(line.quantity);
      if (qty > ordered + EPSILON) {
        throw new WarehouseError(`${outbound.number}: you can pick at most ${formatNumber(ordered)} of ${line.product.name}.`);
      }
      const binId = qty > 0 ? String(formData.get(`bin_${line.id}`) ?? "").trim() || null : null;
      if (binId) {
        await assertBin(tx, binId, outbound.warehouseId);
        await assertBinHas(tx, { binId, productId: line.productId, quantity: qty, productName: line.product.name });
      }
      if (qty > 0) picked++;

      const before = num(line.pickedQty);
      const delta = round3(qty - before);
      if (delta === 0 && binId === line.binId) continue;
      changed++;

      if (delta > 0 && line.salesOrderLineId) await ensureReserved(tx, line.salesOrderLineId, outbound.warehouseId, line.productId, line.product.name, delta);

      // Guarded on the previous value so two pickers can't both apply a delta.
      const { count } = await tx.outboundLine.updateMany({
        where: { id: line.id, pickedQty: line.pickedQty },
        data: { pickedQty: qty, binId },
      });
      if (count === 0) throw new WarehouseError(`${line.product.name} on ${outbound.number} was picked by someone else. Reload and try again.`);
      if (delta !== 0) await allocateStock(tx, { productId: line.productId, warehouseId: outbound.warehouseId, quantity: delta });
    }
  }
  return { picked, changed };
}

/**
 * Makes sure the sales order line's reservation covers everything picked on
 * its open outbound lines after adding `extra`; reserves the shortfall.
 */
async function ensureReserved(tx: Tx, salesOrderLineId: string, warehouseId: string, productId: string, productName: string, extra: number) {
  const soLine = await tx.salesOrderLine.findUniqueOrThrow({
    where: { id: salesOrderLineId },
    select: {
      reservedQty: true,
      outboundLines: { where: { outbound: { status: { in: OPEN_OUTBOUND } } }, select: { pickedQty: true } },
    },
  });
  const pickedSoFar = soLine.outboundLines.reduce((s, l) => s + num(l.pickedQty), 0);
  const needed = round3(pickedSoFar + extra);
  const shortfall = round3(needed - num(soLine.reservedQty));
  if (shortfall <= EPSILON) return;

  const reserved = await reserveStock(tx, { productId, warehouseId, quantity: shortfall });
  if (reserved + EPSILON < shortfall) {
    throw new WarehouseError(
      `Not enough free stock of ${productName} to pick: ${formatNumber(shortfall)} more needed, ${formatNumber(reserved)} available (the rest is reserved for other orders).`,
    );
  }
  await tx.salesOrderLine.update({ where: { id: salesOrderLineId }, data: { reservedQty: { increment: reserved } } });
}

/** Undoes all picks on an outbound order's lines (de-allocates) and clears the picked quantities when `reset`. */
export async function undoPicks(tx: Tx, outboundId: string, opts: { reset: boolean }) {
  const outbound = await tx.outboundOrder.findUniqueOrThrow({ where: { id: outboundId }, include: { lines: true } });
  for (const line of outbound.lines) {
    const picked = num(line.pickedQty);
    if (picked > 0) await allocateStock(tx, { productId: line.productId, warehouseId: outbound.warehouseId, quantity: -picked });
  }
  if (opts.reset) await tx.outboundLine.updateMany({ where: { outboundId }, data: { pickedQty: 0, packedQty: 0, binId: null } });
}
