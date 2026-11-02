import "server-only";
import { db, type Tx } from "@/lib/db";
import { num } from "@/lib/format";
import { remainingQty, unitPriceMap } from "./returns";

export type ReturnSourceLine = { productId: string; sku: string; name: string; unit: string; sold: number; maxQty: number; unitPrice: number };

export type ReturnSource = {
  kind: "invoice" | "salesOrder";
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  invoiceId: string | null;
  salesOrderId: string | null;
  warehouseId: string | null;
  lines: ReturnSourceLine[];
};

type Dec = number | { toString(): string };

const productSelect = { select: { sku: true, name: true, unit: true, type: true } } as const;

/** Quantity per product already on non-cancelled returns of this invoice / order. */
async function alreadyReturned(client: Tx | typeof db, where: { invoiceId?: string; salesOrderId?: string }) {
  const lines = await client.returnLine.findMany({
    where: { returnOrder: { ...where, status: { not: "CANCELLED" } } },
    select: { productId: true, quantity: true, receivedQty: true, returnOrder: { select: { status: true } } },
  });
  const map = new Map<string, number>();
  for (const l of lines) {
    // Once received, only what actually came back counts against the limit.
    const q = l.returnOrder.status === "REQUESTED" ? num(l.quantity) : num(l.receivedQty);
    map.set(l.productId, (map.get(l.productId) ?? 0) + q);
  }
  return map;
}

function toLines(
  rows: Array<{ productId: string; quantity: Dec; lineTotal: Dec; taxAmount: Dec; returnable: number; product: { sku: string; name: string; unit: string; type: string } }>,
  returned: Map<string, number>,
): ReturnSourceLine[] {
  const goods = rows.filter((r) => r.product.type !== "SERVICE");
  const prices = unitPriceMap(goods.map((r) => ({ productId: r.productId, quantity: num(r.quantity), lineTotal: num(r.lineTotal), taxAmount: num(r.taxAmount) })));
  const sold = new Map<string, number>();
  const info = new Map<string, { sku: string; name: string; unit: string }>();
  for (const r of goods) {
    sold.set(r.productId, (sold.get(r.productId) ?? 0) + r.returnable);
    info.set(r.productId, r.product);
  }
  const left = remainingQty(sold, returned);
  return [...sold].map(([productId, q]) => ({
    productId,
    ...info.get(productId)!,
    sold: q,
    maxQty: left.get(productId) ?? 0,
    unitPrice: prices.get(productId) ?? 0,
  }));
}

/**
 * Loads the invoice or sales order a return is raised against, with the
 * returnable quantity per product (sold/delivered minus already returned)
 * and the unit price paid. Services are excluded.
 */
export async function loadReturnSource(
  input: { invoiceId?: string | null; salesOrderId?: string | null },
  client: Tx | typeof db = db,
): Promise<ReturnSource | null> {
  if (input.invoiceId) {
    const inv = await client.invoice.findUnique({
      where: { id: input.invoiceId },
      include: {
        customer: { select: { name: true } },
        salesOrder: { select: { warehouseId: true } },
        lines: { include: { product: productSelect } },
      },
    });
    if (!inv || inv.status === "DRAFT" || inv.status === "CANCELLED") return null;
    const returned = await alreadyReturned(client, { invoiceId: inv.id });
    return {
      kind: "invoice",
      id: inv.id,
      number: inv.number,
      customerId: inv.customerId,
      customerName: inv.customer.name,
      invoiceId: inv.id,
      salesOrderId: inv.salesOrderId,
      warehouseId: inv.salesOrder?.warehouseId ?? null,
      lines: toLines(inv.lines.map((l) => ({ ...l, returnable: num(l.quantity) })), returned),
    };
  }
  if (input.salesOrderId) {
    const so = await client.salesOrder.findUnique({
      where: { id: input.salesOrderId },
      include: { customer: { select: { name: true } }, lines: { include: { product: productSelect } } },
    });
    if (!so || so.status === "DRAFT" || so.status === "CANCELLED") return null;
    const returned = await alreadyReturned(client, { salesOrderId: so.id });
    return {
      kind: "salesOrder",
      id: so.id,
      number: so.number,
      customerId: so.customerId,
      customerName: so.customer.name,
      invoiceId: null,
      salesOrderId: so.id,
      warehouseId: so.warehouseId,
      // Delivered quantity when deliveries are tracked on the order, else the ordered quantity.
      lines: toLines(so.lines.map((l) => ({ ...l, returnable: num(l.deliveredQty) > 0 ? num(l.deliveredQty) : num(l.quantity) })), returned),
    };
  }
  return null;
}
