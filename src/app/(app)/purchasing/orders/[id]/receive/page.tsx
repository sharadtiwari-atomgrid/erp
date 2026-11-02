import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { num, toDateInput } from "@/lib/format";
import { canReceiveGoods } from "../../../_components/access";
import { receivePurchaseOrder } from "../../actions";
import { ReceiveGoodsForm } from "./receive-form";

export const metadata: Metadata = { title: "Receive goods" };

export default async function ReceiveGoodsPage({ params }: PageProps<"/purchasing/orders/[id]/receive">) {
  const user = await requireUser("purchaseOrders");
  if (!canReceiveGoods(user)) redirect("/forbidden");
  const { id } = await params;
  const order = await db.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: { select: { name: true } },
      warehouse: { select: { code: true, name: true } },
      lines: { orderBy: { position: "asc" }, include: { product: { select: { sku: true, name: true, unit: true, qcRequired: true } } } },
    },
  });
  if (!order) notFound();
  if (order.status !== "ORDERED" && order.status !== "PARTIALLY_RECEIVED") redirect(`/purchasing/orders/${id}`);

  const lines = order.lines.map((l) => {
    const ordered = num(l.quantity);
    const received = num(l.receivedQty);
    return { id: l.id, ...l.product, ordered, received, remaining: Math.max(0, Math.round((ordered - received) * 1000) / 1000) };
  });

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={`Receive goods — ${order.number}`}
        description={`From ${order.supplier.name} into ${order.warehouse.code} — ${order.warehouse.name}. This creates a goods receipt note (GRN); stock is updated after QC.`}
        back={{ href: `/purchasing/orders/${id}`, label: order.number }}
      />
      <ReceiveGoodsForm
        action={receivePurchaseOrder.bind(null, id)}
        lines={lines}
        cancelHref={`/purchasing/orders/${id}`}
        today={toDateInput(new Date())}
      />
    </div>
  );
}
