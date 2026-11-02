import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { num, toDateInput } from "@/lib/format";
import { getProductOptions, getSupplierOptions, getWarehouseOptions } from "@/lib/options";
import { updatePurchaseOrder } from "../../actions";
import { PurchaseOrderForm } from "../../order-form";

export const metadata: Metadata = { title: "Edit purchase order" };

export default async function EditPurchaseOrderPage({ params }: PageProps<"/purchasing/orders/[id]/edit">) {
  await requireUser("purchaseOrders", "edit");
  const { id } = await params;
  const order = await db.purchaseOrder.findUnique({
    where: { id },
    include: {
      lines: { orderBy: { position: "asc" } },
      supplier: { select: { id: true, code: true, name: true } },
      warehouse: { select: { id: true, code: true, name: true } },
    },
  });
  if (!order) notFound();
  if (order.status !== "DRAFT") redirect(`/purchasing/orders/${id}`);

  const [suppliers, warehouses, products] = await Promise.all([getSupplierOptions(), getWarehouseOptions(), getProductOptions()]);
  // Keep the current supplier/warehouse selectable even if since deactivated.
  if (!suppliers.some((s) => s.id === order.supplierId)) suppliers.push({ ...order.supplier, paymentTermsDays: 0 });
  if (!warehouses.some((w) => w.id === order.warehouseId)) warehouses.push(order.warehouse);

  return (
    <div className="max-w-5xl">
      <PageHeader title={`Edit ${order.number}`} back={{ href: `/purchasing/orders/${id}`, label: order.number }} />
      <PurchaseOrderForm
        action={updatePurchaseOrder.bind(null, id)}
        suppliers={suppliers}
        warehouses={warehouses}
        products={products}
        cancelHref={`/purchasing/orders/${id}`}
        initial={{
          supplierId: order.supplierId,
          warehouseId: order.warehouseId,
          orderDate: toDateInput(order.orderDate),
          expectedDate: toDateInput(order.expectedDate),
          notes: order.notes,
          lines: order.lines.map((l) => ({
            productId: l.productId,
            description: l.description,
            quantity: num(l.quantity),
            unitPrice: num(l.unitPrice),
            discountPct: num(l.discountPct),
            taxRate: num(l.taxRate),
          })),
        }}
      />
    </div>
  );
}
