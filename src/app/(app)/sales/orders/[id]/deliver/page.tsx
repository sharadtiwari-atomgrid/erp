import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { num } from "@/lib/format";
import { can } from "@/lib/permissions";
import { deliverOrder } from "../../actions";
import { DeliverForm } from "./deliver-form";

export const metadata: Metadata = { title: "Deliver sales order" };

export default async function DeliverOrderPage({ params }: PageProps<"/sales/orders/[id]/deliver">) {
  const user = await requireUser("salesOrders");
  if (!can(user.role, "salesOrders", "edit") && !can(user.role, "stock", "edit")) redirect("/forbidden");
  const { id } = await params;
  const order = await db.salesOrder.findUnique({
    where: { id },
    include: {
      warehouse: { select: { id: true, name: true } },
      lines: {
        orderBy: { position: "asc" },
        include: { product: { select: { sku: true, name: true, unit: true, type: true } } },
      },
    },
  });
  if (!order) notFound();
  if (order.status !== "CONFIRMED" && order.status !== "PARTIALLY_DELIVERED") redirect(`/sales/orders/${id}`);

  const levels = await db.stockLevel.findMany({
    where: { warehouseId: order.warehouseId, productId: { in: order.lines.map((l) => l.productId) } },
    select: { productId: true, quantity: true },
  });
  const onHand = new Map(levels.map((l) => [l.productId, num(l.quantity)]));

  return (
    <div className="max-w-5xl">
      <PageHeader title={`Deliver ${order.number}`} back={{ href: `/sales/orders/${id}`, label: order.number }} />
      <DeliverForm
        action={deliverOrder.bind(null, id)}
        warehouseName={order.warehouse.name}
        cancelHref={`/sales/orders/${id}`}
        rows={order.lines.map((l) => {
          const ordered = num(l.quantity);
          const delivered = num(l.deliveredQty);
          return {
            id: l.id,
            sku: l.product.sku,
            name: l.product.name,
            unit: l.product.unit,
            isService: l.product.type === "SERVICE",
            ordered,
            delivered,
            remaining: Math.max(0, Math.round((ordered - delivered) * 1000) / 1000),
            onHand: onHand.get(l.productId) ?? 0,
          };
        })}
      />
    </div>
  );
}
