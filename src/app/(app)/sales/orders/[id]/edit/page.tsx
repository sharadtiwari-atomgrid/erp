import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { toDateInput } from "@/lib/format";
import { getCustomerOptions, getProductOptions, getWarehouseOptions } from "@/lib/options";
import { DocumentForm } from "../../../_components/document-form";
import { toLineInputs, toOptions } from "../../../_lib/documents";
import { updateOrder } from "../../actions";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Edit sales order" };

export default async function EditSalesOrderPage({ params }: PageProps<"/sales/orders/[id]/edit">) {
  await requireUser("salesOrders", "edit");
  const { id } = await params;
  const [order, customers, warehouses, products] = await Promise.all([
    db.salesOrder.findUnique({ where: { id }, include: { lines: { orderBy: { position: "asc" } } } }),
    getCustomerOptions(),
    getWarehouseOptions(),
    getProductOptions(),
  ]);
  if (!order) notFound();
  if (order.status !== "DRAFT") redirect(`/sales/orders/${id}`);

  return (
    <div className="max-w-5xl">
      <PageHeader title={`Edit ${order.number}`} back={{ href: `/sales/orders/${id}`, label: order.number }} />
      <DocumentForm
        action={updateOrder.bind(null, id)}
        products={products}
        initialLines={toLineInputs(order.lines)}
        notes={order.notes}
        cancelHref={`/sales/orders/${id}`}
        submitLabel="Save sales order"
        fields={[
          { name: "customerId", label: "Customer", type: "select", required: true, options: toOptions(customers), defaultValue: order.customerId, placeholder: "Select a customer…" },
          { name: "warehouseId", label: "Deliver from", type: "select", required: true, options: toOptions(warehouses), defaultValue: order.warehouseId, placeholder: "Select a warehouse…" },
          { name: "orderDate", label: "Order date", type: "date", required: true, defaultValue: toDateInput(order.orderDate) },
          { name: "expectedDate", label: "Expected delivery", type: "date", defaultValue: toDateInput(order.expectedDate) },
        ]}
      />
    </div>
  );
}
