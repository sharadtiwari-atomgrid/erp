import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList, StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatDateTime, formatMoney, formatNumber, num } from "@/lib/format";
import { can } from "@/lib/permissions";
import { canReceiveGoods } from "../../_components/access";
import { cancelPurchaseOrder, placePurchaseOrder } from "../actions";
import { WarehouseStatusBadge } from "../../../warehouse/_components/status";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Purchase order" };

export default async function PurchaseOrderPage({ params }: PageProps<"/purchasing/orders/[id]">) {
  const user = await requireUser("purchaseOrders");
  const { id } = await params;
  const order = await db.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, code: true, name: true, gstin: true, state: true } },
      warehouse: { select: { id: true, code: true, name: true } },
      lines: { orderBy: { position: "asc" }, include: { product: { select: { id: true, sku: true, name: true, unit: true } } } },
    },
  });
  if (!order) notFound();

  const [receipts, activity] = await Promise.all([
    db.inboundReceipt.findMany({
      where: { purchaseOrderId: id },
      orderBy: { createdAt: "desc" },
      include: { lines: { select: { receivedQty: true, acceptedQty: true, rejectedQty: true } } },
    }),
    db.activity.findMany({
      where: { entityType: "PurchaseOrder", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: { select: { name: true } } },
    }),
  ]);

  const canEdit = can(user, "purchaseOrders", "edit");
  const ordered = order.lines.reduce((s, l) => s + num(l.quantity), 0);
  const received = order.lines.reduce((s, l) => s + num(l.receivedQty), 0);
  const nothingReceived = order.lines.every((l) => num(l.receivedQty) === 0);
  const isOpen = order.status === "ORDERED" || order.status === "PARTIALLY_RECEIVED";

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {order.number} <StatusBadge status={order.status} />
          </span>
        }
        description={
          <>
            {order.supplier.name} · {formatDate(order.orderDate)}
          </>
        }
        back={{ href: "/purchasing/orders", label: "Purchase orders" }}
        actions={
          <>
            <ButtonLink href={`/purchasing/orders/${id}/print`} variant="secondary">
              Print
            </ButtonLink>
            {canEdit && (order.status === "DRAFT" || (order.status === "ORDERED" && nothingReceived)) && (
              <ActionButton
                action={cancelPurchaseOrder.bind(null, id)}
                variant="secondary"
                confirmMessage={`Cancel ${order.number}? This cannot be undone.`}
                pendingText="Cancelling…"
              >
                Cancel order
              </ActionButton>
            )}
            {canEdit && order.status === "DRAFT" && (
              <>
                <ButtonLink href={`/purchasing/orders/${id}/edit`} variant="secondary">
                  Edit
                </ButtonLink>
                <ActionButton action={placePurchaseOrder.bind(null, id)} variant="primary" pendingText="Placing…">
                  Place order
                </ActionButton>
              </>
            )}
            {isOpen && canReceiveGoods(user) && <ButtonLink href={`/purchasing/orders/${id}/receive`}>Receive goods</ButtonLink>}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total" value={formatMoney(order.total)} hint={`Incl. GST ${formatMoney(order.taxTotal)}`} />
        <StatCard
          label="Received"
          value={`${formatNumber(received)} / ${formatNumber(ordered)}`}
          hint={order.status === "RECEIVED" ? "Fully received" : isOpen ? "Units received / ordered" : "Units"}
          tone={order.status === "PARTIALLY_RECEIVED" ? "warning" : "default"}
        />
        <StatCard
          label="Expected delivery"
          value={formatDate(order.expectedReceiptDate)}
          tone={isOpen && order.expectedReceiptDate && order.expectedReceiptDate < new Date() ? "danger" : "default"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Details" />
          <CardBody>
            <DetailList
              items={[
                {
                  label: "Supplier",
                  value: (
                    <Link href={`/contacts/${order.supplier.id}`} className="font-medium text-brand-700 hover:underline">
                      {order.supplier.name}
                    </Link>
                  ),
                },
                { label: "Supplier GSTIN", value: order.supplier.gstin },
                {
                  label: "Receiving warehouse",
                  value: (
                    <Link href={`/inventory/warehouses/${order.warehouse.id}`} className="text-brand-700 hover:underline">
                      {order.warehouse.code} — {order.warehouse.name}
                    </Link>
                  ),
                },
                { label: "Order date", value: formatDate(order.orderDate) },
                { label: "Posting date", value: formatDate(order.postingDate) },
                { label: "Expected receipt date", value: formatDate(order.expectedReceiptDate) },
                { label: "Vendor order no.", value: order.vendorOrderNo },
                { label: "Pay-to vendor", value: order.payToVendorId ? "Specified" : "Same as supplier" },
                { label: "Payment terms code", value: order.paymentTermsCode },
                { label: "Payment method code", value: order.paymentMethodCode },
                { label: "Shipment method code", value: order.shipmentMethodCode },
                { label: "Currency code", value: order.currencyCode },
                { label: "External document no.", value: order.externalDocumentNo },
                { label: "Purchaser code", value: order.purchaserCode },
                { label: "Posting description", value: order.postingDescription },
                { label: "Location code", value: order.locationCode ?? order.warehouse.code },
                { label: "Ship-to", value: [order.shipToName, order.shipToAddress, order.shipToCity, order.shipToState, order.shipToPincode].filter(Boolean).join(", ") || "—" },
                { label: "Notes", value: order.notes },
              ]}
            />
          </CardBody>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Items" />
            <Table>
              <THead>
                <tr>
                  <TH>Product</TH>
                  <TH align="right">Ordered</TH>
                  <TH align="right">Received</TH>
                  <TH align="right">Unit price</TH>
                  <TH align="right">Disc %</TH>
                  <TH align="right">GST %</TH>
                  <TH align="right">Amount</TH>
                </tr>
              </THead>
              <TBody>
                {order.lines.map((l) => {
                  const done = num(l.receivedQty) >= num(l.quantity);
                  return (
                    <TR key={l.id}>
                      <TD>
                        <Link href={`/inventory/products/${l.product.id}`} className="font-medium text-brand-700 hover:underline">
                          {l.product.name}
                        </Link>
                        <div className="font-mono text-xs text-ink-faint">{l.product.sku}</div>
                        {l.description && <div className="text-xs text-ink-soft">{l.description}</div>}
                      </TD>
                      <TD align="right">
                        {formatNumber(l.quantity)} <span className="text-xs text-ink-faint">{l.product.unit}</span>
                      </TD>
                      <TD align="right" className={done ? "text-emerald-700" : num(l.receivedQty) > 0 ? "text-amber-700" : "text-ink-faint"}>
                        {formatNumber(l.receivedQty)}
                      </TD>
                      <TD align="right">{formatMoney(l.unitPrice)}</TD>
                      <TD align="right">{formatNumber(l.discountPct, 2)}</TD>
                      <TD align="right">{formatNumber(l.taxRate, 2)}</TD>
                      <TD align="right">{formatMoney(l.lineTotal)}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <CardBody className="flex justify-end border-t border-line">
              <dl className="w-64 space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-ink-soft">Subtotal</dt>
                  <dd className="tabular-nums">{formatMoney(order.subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-soft">GST</dt>
                  <dd className="tabular-nums">{formatMoney(order.taxTotal)}</dd>
                </div>
                <div className="flex justify-between border-t border-line pt-1 font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{formatMoney(order.total)}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Goods receipts (GRN)" description="Stock is posted when QC is completed on each GRN" />
            <Table>
              <THead>
                <tr>
                  <TH>GRN</TH>
                  <TH>Received</TH>
                  <TH>Invoice / vehicle</TH>
                  <TH align="right">Received qty</TH>
                  <TH align="right">Accepted</TH>
                  <TH align="right">Rejected</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {receipts.length === 0 && <EmptyRow colSpan={7}>Nothing received yet.</EmptyRow>}
                {receipts.map((r) => {
                  const done = r.status === "COMPLETED";
                  return (
                    <TR key={r.id}>
                      <TD>
                        <Link href={`/warehouse/inbound/${r.id}`} className="font-medium text-brand-700 hover:underline">
                          {r.number}
                        </Link>
                      </TD>
                      <TD className="whitespace-nowrap text-ink-soft">{formatDateTime(r.receivedAt)}</TD>
                      <TD className="text-xs text-ink-soft">
                        {r.supplierInvoice ?? "—"}
                        {r.vehicleNo && <div className="font-mono">{r.vehicleNo}</div>}
                      </TD>
                      <TD align="right">{formatNumber(r.lines.reduce((s, l) => s + num(l.receivedQty), 0))}</TD>
                      <TD align="right">{done ? formatNumber(r.lines.reduce((s, l) => s + num(l.acceptedQty), 0)) : "—"}</TD>
                      <TD align="right">{done ? formatNumber(r.lines.reduce((s, l) => s + num(l.rejectedQty), 0)) : "—"}</TD>
                      <TD>
                        <WarehouseStatusBadge status={r.status} />
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Card>

          <Card>
            <CardHeader title="History" />
            <ul className="divide-y divide-line">
              {activity.length === 0 && <li className="px-5 py-10 text-center text-sm text-ink-faint">No activity yet.</li>}
              {activity.map((a) => (
                <li key={a.id} className="px-5 py-3">
                  <p className="text-sm text-ink">{a.message}</p>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    {a.user?.name ?? "System"} · {formatDateTime(a.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
