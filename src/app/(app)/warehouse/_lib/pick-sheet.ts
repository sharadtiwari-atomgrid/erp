import "server-only";
import { db } from "@/lib/db";
import { num } from "@/lib/format";
import type { PickGroup } from "../_components/pick-form";

/** Data for <PickForm />: lines of the given outbound orders, the warehouse's bins and bin stock. */
export async function loadPickSheet(outboundIds: string[], warehouseId: string) {
  const [outbounds, bins] = await Promise.all([
    db.outboundOrder.findMany({
      where: { id: { in: outboundIds } },
      orderBy: { number: "asc" },
      include: {
        salesOrder: { select: { number: true, customer: { select: { name: true } } } },
        lines: { orderBy: { product: { name: "asc" } }, include: { product: { select: { sku: true, name: true, unit: true } } } },
      },
    }),
    db.bin.findMany({ where: { warehouseId, isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true } }),
  ]);
  const productIds = [...new Set(outbounds.flatMap((o) => o.lines.map((l) => l.productId)))];
  const [levels, binStocks] = await Promise.all([
    db.stockLevel.findMany({ where: { warehouseId, productId: { in: productIds } }, select: { productId: true, quantity: true } }),
    db.binStock.findMany({ where: { bin: { warehouseId }, productId: { in: productIds }, quantity: { gt: 0 } }, select: { binId: true, productId: true, quantity: true } }),
  ]);
  const inHand = new Map(levels.map((l) => [l.productId, num(l.quantity)]));

  const groups: PickGroup[] = outbounds.map((o) => ({
    id: o.id,
    number: o.number,
    subtitle: `${o.salesOrder.number} · ${o.salesOrder.customer.name}`,
    lines: o.lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      sku: l.product.sku,
      name: l.product.name,
      unit: l.product.unit,
      quantity: num(l.quantity),
      picked: num(l.pickedQty),
      binId: l.binId,
      inHand: inHand.get(l.productId) ?? 0,
    })),
  }));
  const binStock = Object.fromEntries(binStocks.map((b) => [`${b.binId}:${b.productId}`, num(b.quantity)]));
  return { groups, bins, binStock };
}
