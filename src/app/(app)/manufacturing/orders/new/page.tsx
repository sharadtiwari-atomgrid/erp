import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatNumber, num, toDateInput } from "@/lib/format";
import { param } from "@/lib/forms";
import { round3 } from "../../_lib/bom-math";
import { getPlantWarehouseId, OPEN_ORDER_STATUSES } from "../../_lib/server";
import { createProductionOrder } from "../actions";
import { getOrderFormData } from "../form-data";
import { ProductionOrderForm, type OrderFormValues } from "../order-form";

export const metadata: Metadata = { title: "New production order" };

/**
 * `?productId=&bomId=` preselects a product, `?salesOrderId=&salesOrderLineId=`
 * prefills an MTO/ATO order for the part of a sales order line that is not
 * yet delivered or already in production.
 */
export default async function NewProductionOrderPage({ searchParams }: PageProps<"/manufacturing/orders/new">) {
  await requireUser("production", "edit");
  const sp = await searchParams;
  const salesOrderLineId = param(sp, "salesOrderLineId");
  const plantWarehouseId = await getPlantWarehouseId();

  const initial: OrderFormValues = {
    productId: param(sp, "productId"),
    bomId: param(sp, "bomId"),
    quantity: 1,
    mode: "",
    warehouseId: plantWarehouseId ?? "",
    dueDate: "",
    priority: 3,
    notes: null,
    salesOrderId: param(sp, "salesOrderId") || null,
    salesOrderLineId: null,
  };
  let linkedTo: string | undefined;
  let notice: string | undefined;

  if (salesOrderLineId) {
    const line = await db.salesOrderLine.findUnique({
      where: { id: salesOrderLineId },
      include: {
        product: { select: { name: true, unit: true, supplyMode: true } },
        salesOrder: { select: { id: true, number: true, expectedDate: true, customer: { select: { name: true } } } },
        productionOrders: { where: { status: { in: [...OPEN_ORDER_STATUSES] } }, select: { quantity: true, producedQty: true } },
      },
    });
    if (line) {
      const outstanding = round3(num(line.quantity) - num(line.deliveredQty));
      const inProduction = round3(line.productionOrders.reduce((s, o) => s + num(o.quantity) - num(o.producedQty), 0));
      const toMake = round3(outstanding - inProduction);
      Object.assign(initial, {
        productId: line.productId,
        quantity: toMake > 0 ? toMake : outstanding > 0 ? outstanding : 1,
        mode: line.product.supplyMode === "ATO" ? "ATO" : "MTO",
        dueDate: toDateInput(line.salesOrder.expectedDate),
        priority: 2,
        salesOrderId: line.salesOrder.id,
        salesOrderLineId: line.id,
        notes: `For ${line.salesOrder.number} (${line.salesOrder.customer.name})`,
      });
      linkedTo = `sales order ${line.salesOrder.number} · ${line.salesOrder.customer.name} · ${line.product.name}: ${formatNumber(outstanding)} ${line.product.unit} outstanding`;
      if (inProduction > 0) notice = `${formatNumber(inProduction)} ${line.product.unit} are already in open production orders for this line.`;
    }
  }

  const data = await getOrderFormData({ productId: initial.productId });

  return (
    <div className="max-w-4xl">
      <PageHeader title="New production order" back={{ href: "/manufacturing/orders", label: "Production orders" }} description={notice} />
      <ProductionOrderForm action={createProductionOrder} initial={initial} cancelHref="/manufacturing/orders" linkedTo={linkedTo} {...data} />
    </div>
  );
}
