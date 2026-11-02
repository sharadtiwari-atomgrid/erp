import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { branchWhere } from "@/lib/branch";
import { db } from "@/lib/db";
import { formatDate, num } from "@/lib/format";
import { param } from "@/lib/forms";
import { can } from "@/lib/permissions";
import { salesLineRemainders } from "../../_lib/outbound";
import { createOutbound } from "../actions";
import { OutboundForm } from "./outbound-form";

export const metadata: Metadata = { title: "New outbound order" };

export default async function NewOutboundPage({ searchParams }: PageProps<"/warehouse/outbound/new">) {
  const user = await requireUser("outbound");
  if (!can(user, "outbound", "edit") && !can(user, "salesOrders", "edit")) redirect("/forbidden");
  const sp = await searchParams;
  const salesOrderId = param(sp, "salesOrderId");

  if (!salesOrderId) {
    const orders = await db.salesOrder.findMany({
      where: { ...(await branchWhere()), status: { in: ["CONFIRMED", "PARTIALLY_DELIVERED"] } },
      orderBy: { orderDate: "desc" },
      select: { id: true, number: true, orderDate: true, customer: { select: { name: true } }, warehouse: { select: { code: true } } },
    });
    return (
      <div className="max-w-2xl">
        <PageHeader title="New outbound order" description="Ship (part of) a confirmed sales order." back={{ href: "/warehouse/outbound", label: "Outbound" }} />
        <Card>
          <CardHeader title="Choose a sales order" />
          <CardBody>
            <form className="flex flex-wrap items-center gap-2">
              <Select name="salesOrderId" required className="min-w-72 flex-1" aria-label="Sales order" defaultValue="">
                <option value="">Select a confirmed sales order…</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.number} — {o.customer.name} ({o.warehouse.code}, {formatDate(o.orderDate)})
                  </option>
                ))}
              </Select>
              <button type="submit" className={buttonClass("primary")}>
                Continue
              </button>
            </form>
            {orders.length === 0 && <p className="mt-3 text-sm text-ink-faint">No confirmed sales orders are waiting to ship.</p>}
          </CardBody>
        </Card>
      </div>
    );
  }

  const order = await db.salesOrder.findUnique({
    where: { id: salesOrderId },
    include: {
      customer: { select: { name: true } },
      warehouse: { select: { code: true, name: true } },
      lines: { orderBy: { position: "asc" }, include: { product: { select: { sku: true, name: true, unit: true, type: true } } } },
    },
  });
  if (!order) notFound();
  if (order.status !== "CONFIRMED" && order.status !== "PARTIALLY_DELIVERED") redirect(`/sales/orders/${order.id}`);

  const goods = order.lines.filter((l) => l.product.type === "GOODS");
  const [remainders, levels] = await Promise.all([
    salesLineRemainders(db, order.id),
    db.stockLevel.findMany({
      where: { warehouseId: order.warehouseId, productId: { in: goods.map((l) => l.productId) } },
      select: { productId: true, quantity: true, reservedQty: true },
    }),
  ]);
  const remainderBy = new Map(remainders.map((r) => [r.lineId, r]));
  const free = new Map(levels.map((l) => [l.productId, Math.max(0, num(l.quantity) - num(l.reservedQty))]));

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={`Ship ${order.number}`}
        description={`${order.customer.name} · from ${order.warehouse.code} — ${order.warehouse.name}`}
        back={{ href: `/sales/orders/${order.id}`, label: order.number }}
      />
      <OutboundForm
        action={createOutbound.bind(null, order.id)}
        cancelHref={`/sales/orders/${order.id}`}
        lines={goods.map((l) => {
          const r = remainderBy.get(l.id)!;
          return {
            id: l.id,
            sku: l.product.sku,
            name: l.product.name,
            unit: l.product.unit,
            ordered: r.ordered,
            delivered: r.delivered,
            onOpenOutbound: r.onOpenOutbound,
            remainder: r.remainder,
            reserved: r.reserved,
            available: free.get(l.productId) ?? 0,
          };
        })}
      />
    </div>
  );
}
