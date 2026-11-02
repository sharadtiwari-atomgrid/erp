import "server-only";
import { db } from "@/lib/db";
import { num } from "@/lib/format";

/** Total on-hand quantity per product across all warehouses (or one warehouse). */
export async function getOnHandByProduct(productIds?: string[], warehouseId?: string): Promise<Map<string, number>> {
  const levels = await db.stockLevel.groupBy({
    by: ["productId"],
    where: {
      ...(productIds && { productId: { in: productIds } }),
      ...(warehouseId && { warehouseId }),
    },
    _sum: { quantity: true },
  });
  return new Map(levels.map((l) => [l.productId, num(l._sum.quantity)]));
}

/** Non-zero stock levels keyed "productId:warehouseId", for client forms that show what is on hand. */
export async function getStockLevelMap(): Promise<Record<string, number>> {
  const levels = await db.stockLevel.findMany({
    where: { quantity: { not: 0 } },
    select: { productId: true, warehouseId: true, quantity: true },
  });
  return Object.fromEntries(levels.map((l) => [`${l.productId}:${l.warehouseId}`, num(l.quantity)]));
}

/** Low stock = goods at or below their reorder level. Same rule as the dashboard. */
export function isLowStock(product: { type: string; reorderLevel: number }, onHand: number): boolean {
  return product.type === "GOODS" && product.reorderLevel > 0 && onHand <= product.reorderLevel;
}

export type StockBreakdown = {
  productId: string;
  warehouseId: string;
  /** In hand. */
  quantity: number;
  /** Promised to confirmed sales / production orders. */
  reserved: number;
  /** Picked into picking (subset of reserved). */
  allocated: number;
  /** In hand minus reserved. */
  available: number;
  /** Received on GRNs still awaiting QC (not yet in stock). */
  inQc: number;
};

const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

/**
 * In hand / reserved / allocated / available / in-QC per product × warehouse.
 * Only combinations with a non-zero figure are returned.
 */
export async function getStockBreakdown(opts: { productIds?: string[]; warehouseIds?: string[] } = {}): Promise<StockBreakdown[]> {
  const productFilter = opts.productIds ? { productId: { in: opts.productIds } } : {};
  const warehouseFilter = opts.warehouseIds ? { warehouseId: { in: opts.warehouseIds } } : {};
  const [levels, qcLines] = await Promise.all([
    db.stockLevel.findMany({
      where: {
        ...productFilter,
        ...warehouseFilter,
        OR: [{ quantity: { not: 0 } }, { reservedQty: { not: 0 } }, { allocatedQty: { not: 0 } }],
      },
      select: { productId: true, warehouseId: true, quantity: true, reservedQty: true, allocatedQty: true },
    }),
    db.inboundLine.findMany({
      where: { ...productFilter, receipt: { status: "QC_PENDING", ...warehouseFilter } },
      select: { productId: true, receivedQty: true, receipt: { select: { warehouseId: true } } },
    }),
  ]);

  const rows = new Map<string, StockBreakdown>();
  const row = (productId: string, warehouseId: string) => {
    const key = `${productId}:${warehouseId}`;
    let r = rows.get(key);
    if (!r) {
      r = { productId, warehouseId, quantity: 0, reserved: 0, allocated: 0, available: 0, inQc: 0 };
      rows.set(key, r);
    }
    return r;
  };
  for (const l of levels) {
    const r = row(l.productId, l.warehouseId);
    r.quantity = num(l.quantity);
    r.reserved = num(l.reservedQty);
    r.allocated = num(l.allocatedQty);
  }
  for (const l of qcLines) {
    const r = row(l.productId, l.receipt.warehouseId);
    r.inQc = r3(r.inQc + num(l.receivedQty));
  }
  for (const r of rows.values()) r.available = r3(r.quantity - r.reserved);
  return [...rows.values()];
}
