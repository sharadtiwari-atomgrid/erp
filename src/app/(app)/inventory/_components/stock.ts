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
