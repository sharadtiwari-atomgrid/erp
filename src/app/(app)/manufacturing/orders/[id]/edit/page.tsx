import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { num, toDateInput } from "@/lib/format";
import { updateProductionOrder } from "../../actions";
import { getOrderFormData } from "../../form-data";
import { ProductionOrderForm } from "../../order-form";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Edit production order" };

export default async function EditProductionOrderPage({ params }: PageProps<"/manufacturing/orders/[id]/edit">) {
  await requireUser("production", "edit");
  const { id } = await params;
  const order = await db.productionOrder.findUnique({ where: { id }, include: { salesOrder: { select: { number: true } } } });
  if (!order) notFound();
  if (order.status !== "DRAFT") redirect(`/manufacturing/orders/${id}`);
  const data = await getOrderFormData({ productId: order.productId, bomId: order.bomId, warehouseId: order.warehouseId });

  return (
    <div className="max-w-4xl">
      <PageHeader title={`Edit ${order.number}`} back={{ href: `/manufacturing/orders/${id}`, label: order.number }} />
      <ProductionOrderForm
        action={updateProductionOrder.bind(null, id)}
        cancelHref={`/manufacturing/orders/${id}`}
        linkedTo={order.salesOrder ? `sales order ${order.salesOrder.number}` : undefined}
        initial={{
          productId: order.productId,
          bomId: order.bomId,
          quantity: num(order.quantity),
          mode: order.mode,
          warehouseId: order.warehouseId,
          dueDate: toDateInput(order.dueDate),
          priority: order.priority,
          notes: order.notes,
          salesOrderId: order.salesOrderId,
          salesOrderLineId: order.salesOrderLineId,
        }}
        {...data}
      />
    </div>
  );
}
