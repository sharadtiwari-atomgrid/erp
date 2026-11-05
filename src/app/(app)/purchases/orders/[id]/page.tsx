import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, CardBody, CardHeader, DetailList } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ActionButton } from "@/components/ui/action-button";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { can } from "@/lib/permissions";
import { cancelPurchaseOrder, confirmPurchaseOrder } from "../actions";

export const instant = false;
export const metadata: Metadata = { title: "Purchase Order" };

export default async function PurchaseOrderPage({ params }: PageProps<"/purchases/orders/[id]">) {
  const user = await requireUser("finance");
  const { id } = await params;
  const order = await db.purchaseOrder.findUnique({ where: { id }, include: {
    supplier: { select: { id: true, code: true, name: true, gstin: true } },
    warehouse: { select: { id: true, code: true, name: true } },
    lines: { orderBy: { position: "asc" }, include: { product: { select: { id: true, sku: true, name: true, unit: true } } } },
    purchaseInvoices: { select: { id: true, number: true, status: true, total: true }, orderBy: { createdAt: "desc" } },
  }});
  if (!order) notFound();
  const editable = can(user, "finance", "edit") && order.status === "DRAFT";
  return <>
    <PageHeader title={<span className="flex items-center gap-3">{order.number} <StatusBadge status={order.status} /></span>}
      description={order.supplier.name} back={{ href: "/purchases/orders", label: "Purchase Orders" }}
      actions={<>
        {editable && <ButtonLink href={"/purchases/orders/" + id + "/edit"} variant="secondary">Edit</ButtonLink>}
        {editable && <ActionButton action={confirmPurchaseOrder.bind(null, id)} variant="primary">Order</ActionButton>}
        {(order.status === "DRAFT" || order.status === "ORDERED") && <ActionButton action={cancelPurchaseOrder.bind(null, id)} variant="ghost" confirmMessage="Cancel this purchase order?">Cancel</ActionButton>}
        {order.status !== "DRAFT" && <ButtonLink href={"/finance/purchase-invoices/new?purchaseOrderId=" + id}>Create Purchase Invoice</ButtonLink>}
      </>}
    />
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        <Card><CardHeader title="Line items" /><Table>
          <THead><tr><TH>Item</TH><TH align="right">Quantity</TH><TH align="right">Unit Price</TH><TH align="right">Amount</TH><TH align="right">Received</TH></tr></THead>
          <TBody>{order.lines.length === 0 && <EmptyRow colSpan={5}>No line items.</EmptyRow>}
          {order.lines.map(l => <TR key={l.id}><TD>{l.product.name}<div className="text-xs text-ink-soft">{l.product.sku}</div></TD><TD align="right">{formatNumber(l.quantity)} {l.product.unit}</TD><TD align="right">{formatMoney(l.unitPrice)}</TD><TD align="right">{formatMoney(l.lineTotal)}</TD><TD align="right">{formatNumber(l.receivedQty)}</TD></TR>)}</TBody>
        </Table>
        <div className="flex justify-end border-t border-line p-4"><div className="space-y-1 text-right"><div>Subtotal: {formatMoney(order.subtotal)}</div><div>Tax: {formatMoney(order.taxTotal)}</div><div className="font-semibold">Total: {formatMoney(order.total)}</div></div></div>
        </Card>
        {order.purchaseInvoices.length > 0 && <Card><CardHeader title="Purchase invoices" /><Table><THead><tr><TH>Number</TH><TH>Status</TH><TH align="right">Total</TH></tr></THead><TBody>{order.purchaseInvoices.map(i => <TR key={i.id}><TD><Link href={"/finance/purchase-invoices/" + i.id} className="text-brand-700 hover:underline">{i.number}</Link></TD><TD><StatusBadge status={i.status} /></TD><TD align="right">{formatMoney(i.total)}</TD></TR>)}</TBody></Table></Card>}
      </div>
      <Card><CardHeader title="Details" /><CardBody><DetailList items={[
        { label: "Buy-from Vendor", value: order.supplier.name },
        { label: "Location Code", value: order.warehouse.code },
        { label: "Order Date", value: formatDate(order.orderDate) },
        { label: "Posting Date", value: formatDate(order.postingDate) },
        { label: "Expected Receipt Date", value: formatDate(order.expectedReceiptDate) },
        { label: "Vendor Order No.", value: order.vendorOrderNo },
        { label: "Payment Terms Code", value: order.paymentTermsCode },
        { label: "Payment Method Code", value: order.paymentMethodCode },
        { label: "Currency Code", value: order.currencyCode },
        { label: "External Document No.", value: order.externalDocumentNo },
        { label: "Purchaser Code", value: order.purchaserCode },
        { label: "Posting Description", value: order.postingDescription },
      ]} /></Card>
    </div>
  </>;
}
