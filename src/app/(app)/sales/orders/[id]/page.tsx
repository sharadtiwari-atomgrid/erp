import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList, StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney, formatNumber, num } from "@/lib/format";
import { can } from "@/lib/permissions";
import { ActionButton } from "@/components/ui/action-button";
import { ActivityCard } from "../../_components/activity-card";
import { DocumentTotals, ProductCell } from "../../_components/document-lines";
import { cancelOrder, confirmOrder, createInvoiceFromOrder, reserveOrderStock } from "../actions";
import { WarehouseStatusBadge } from "../../../warehouse/_components/status";
import { salesLineRemainders } from "../../../warehouse/_lib/outbound";

export const metadata: Metadata = { title: "Sales order" };

export default async function SalesOrderPage({ params }: PageProps<"/sales/orders/[id]">) {
  const user = await requireUser("salesOrders");
  const { id } = await params;
  const order = await db.salesOrder.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, code: true, name: true } },
      warehouse: { select: { id: true, code: true, name: true } },
      quotation: { select: { id: true, number: true } },
      invoices: { orderBy: { createdAt: "desc" }, select: { id: true, number: true, status: true, total: true } },
      outboundOrders: {
        orderBy: { createdAt: "desc" },
        select: { id: true, number: true, status: true, createdAt: true, dispatchedAt: true, lines: { select: { quantity: true, pickedQty: true } } },
      },
      lines: {
        orderBy: { position: "asc" },
        include: { product: { select: { id: true, sku: true, name: true, unit: true, type: true } } },
      },
    },
  });
  if (!order) notFound();

  const [levels, remainders] = await Promise.all([
    db.stockLevel.findMany({
      where: { warehouseId: order.warehouseId, productId: { in: order.lines.map((l) => l.productId) } },
      select: { productId: true, quantity: true, reservedQty: true },
    }),
    salesLineRemainders(db, id),
  ]);
  const free = new Map(levels.map((l) => [l.productId, num(l.quantity) - num(l.reservedQty)]));
  const remainderBy = new Map(remainders.map((r) => [r.lineId, r]));

  const lines = order.lines.map((l) => {
    const ordered = num(l.quantity);
    const delivered = num(l.deliveredQty);
    const remaining = Math.max(0, Math.round((ordered - delivered) * 1000) / 1000);
    const reserved = num(l.reservedQty);
    const isGoods = l.product.type === "GOODS";
    return {
      ...l,
      ordered,
      delivered,
      remaining,
      reserved,
      short: isGoods ? Math.max(0, Math.round((remaining - reserved) * 1000) / 1000) : 0,
      toShip: isGoods ? (remainderBy.get(l.id)?.remainder ?? 0) : 0,
    };
  });
  const totalOrdered = lines.reduce((s, l) => s + l.ordered, 0);
  const totalDelivered = lines.reduce((s, l) => s + l.delivered, 0);
  const activeInvoice = order.invoices.find((i) => i.status !== "CANCELLED");

  const canEdit = can(user, "salesOrders", "edit");
  const isOpen = order.status === "CONFIRMED" || order.status === "PARTIALLY_DELIVERED";
  const canShip = (can(user, "outbound", "edit") || canEdit) && isOpen && lines.some((l) => l.toShip > 0);
  const anyShort = isOpen && lines.some((l) => l.short > 0);
  const hasOpenOutbound = order.outboundOrders.some((o) => o.status !== "DISPATCHED" && o.status !== "CANCELLED");
  const canInvoice =
    can(user, "invoices", "edit") && !activeInvoice && order.status !== "DRAFT" && order.status !== "CANCELLED";
  const canCancel =
    canEdit && (order.status === "DRAFT" || order.status === "CONFIRMED") && totalDelivered === 0 && !activeInvoice && !hasOpenOutbound;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {order.number} <StatusBadge status={order.status} />
          </span>
        }
        description={order.customer.name}
        back={{ href: "/sales/orders", label: "Sales orders" }}
        actions={
          <>
            {canCancel && (
              <ActionButton action={cancelOrder.bind(null, id)} variant="ghost" confirmMessage="Cancel this sales order?">
                Cancel order
              </ActionButton>
            )}
            {canEdit && order.status === "DRAFT" && (
              <>
                <ButtonLink href={`/sales/orders/${id}/edit`} variant="secondary">
                  Edit
                </ButtonLink>
                <ActionButton action={confirmOrder.bind(null, id)} variant="primary">
                  Confirm order
                </ActionButton>
              </>
            )}
            {canInvoice && (
              <ActionButton
                action={createInvoiceFromOrder.bind(null, id)}
                variant={canShip ? "secondary" : "primary"}
                pendingText="Creating…"
              >
                Create invoice
              </ActionButton>
            )}
            {canEdit && anyShort && (
              <ActionButton action={reserveOrderStock.bind(null, id)} variant="secondary" pendingText="Reserving…">
                Reserve stock
              </ActionButton>
            )}
            {canShip && <ButtonLink href={`/warehouse/outbound/new?salesOrderId=${id}`}>Create outbound order</ButtonLink>}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Order total" value={formatMoney(order.total)} hint={`${lines.length} line${lines.length === 1 ? "" : "s"}`} />
        <StatCard
          label="Delivered"
          value={totalOrdered > 0 ? `${Math.round((totalDelivered / totalOrdered) * 100)}%` : "—"}
          hint={`${formatNumber(totalDelivered)} of ${formatNumber(totalOrdered)} units`}
        />
        <StatCard
          label="Invoice"
          value={
            activeInvoice ? (
              <Link href={`/sales/invoices/${activeInvoice.id}`} className="text-brand-700 hover:underline">
                {activeInvoice.number}
              </Link>
            ) : (
              "Not invoiced"
            )
          }
          hint={activeInvoice ? <StatusBadge status={activeInvoice.status} /> : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="Line items"
              description={`Reserved is stock held for this order in ${order.warehouse.name}; short is undelivered quantity not yet reserved (free stock shown in brackets).`}
            />
            <Table>
              <THead>
                <tr>
                  <TH>Product</TH>
                  <TH align="right">Ordered</TH>
                  <TH align="right">Delivered</TH>
                  <TH align="right">Remaining</TH>
                  <TH align="right">Reserved</TH>
                  <TH align="right">Short</TH>
                  <TH align="right">Unit price</TH>
                  <TH align="right">Amount</TH>
                </tr>
              </THead>
              <TBody>
                {lines.length === 0 && <EmptyRow colSpan={8}>No line items.</EmptyRow>}
                {lines.map((l) => {
                  const isService = l.product.type === "SERVICE";
                  return (
                    <TR key={l.id}>
                      <TD>
                        <ProductCell line={l} />
                      </TD>
                      <TD align="right">
                        {formatNumber(l.ordered)} <span className="text-xs text-ink-faint">{l.product.unit}</span>
                      </TD>
                      <TD align="right">{formatNumber(l.delivered)}</TD>
                      <TD align="right">{l.remaining > 0 ? formatNumber(l.remaining) : <Badge tone="green">Done</Badge>}</TD>
                      <TD align="right">{isService ? <span className="text-ink-faint">Service</span> : formatNumber(l.reserved)}</TD>
                      <TD align="right">
                        {isService || l.remaining === 0 ? (
                          <span className="text-ink-faint">—</span>
                        ) : l.short > 0 ? (
                          <span title="Free stock in the warehouse">
                            <Badge tone={order.status === "DRAFT" ? "gray" : "red"}>{formatNumber(l.short)}</Badge>{" "}
                            <span className="text-xs text-ink-faint">({formatNumber(Math.max(0, free.get(l.productId) ?? 0))})</span>
                          </span>
                        ) : (
                          <Badge tone="green">0</Badge>
                        )}
                      </TD>
                      <TD align="right">{formatMoney(l.unitPrice)}</TD>
                      <TD align="right">{formatMoney(l.lineTotal)}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <DocumentTotals subtotal={order.subtotal} taxTotal={order.taxTotal} total={order.total} />
          </Card>

          {order.outboundOrders.length > 0 && (
            <Card>
              <CardHeader title="Outbound orders" description="Pick, pack and dispatch in the warehouse" />
              <Table>
                <THead>
                  <tr>
                    <TH>Number</TH>
                    <TH>Created</TH>
                    <TH align="right">Qty</TH>
                    <TH align="right">Picked</TH>
                    <TH>Dispatched</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <TBody>
                  {order.outboundOrders.map((o) => (
                    <TR key={o.id}>
                      <TD>
                        <Link href={`/warehouse/outbound/${o.id}`} className="font-medium text-brand-700 hover:underline">
                          {o.number}
                        </Link>
                      </TD>
                      <TD className="text-ink-soft">{formatDate(o.createdAt)}</TD>
                      <TD align="right">{formatNumber(o.lines.reduce((s, l) => s + num(l.quantity), 0))}</TD>
                      <TD align="right">{formatNumber(o.lines.reduce((s, l) => s + num(l.pickedQty), 0))}</TD>
                      <TD className="text-ink-soft">{formatDate(o.dispatchedAt)}</TD>
                      <TD>
                        <WarehouseStatusBadge status={o.status} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          )}

          {order.invoices.length > 0 && (
            <Card>
              <CardHeader title="Invoices" />
              <Table>
                <THead>
                  <tr>
                    <TH>Number</TH>
                    <TH>Status</TH>
                    <TH align="right">Total</TH>
                  </tr>
                </THead>
                <TBody>
                  {order.invoices.map((inv) => (
                    <TR key={inv.id}>
                      <TD>
                        <Link href={`/sales/invoices/${inv.id}`} className="font-medium text-brand-700 hover:underline">
                          {inv.number}
                        </Link>
                      </TD>
                      <TD>
                        <StatusBadge status={inv.status} />
                      </TD>
                      <TD align="right">{formatMoney(inv.total)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          )}
        </div>

        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DetailList
                items={[
                  {
                    label: "Customer",
                    value: (
                      <Link href={`/contacts/${order.customer.id}`} className="text-brand-700 hover:underline">
                        {order.customer.name}
                      </Link>
                    ),
                  },
                  { label: "Warehouse", value: order.warehouse.name },
                  { label: "Order date", value: formatDate(order.orderDate) },
                  { label: "Expected delivery", value: formatDate(order.expectedDate) },
                  {
                    label: "Quotation",
                    value: order.quotation && (
                      <Link href={`/sales/quotations/${order.quotation.id}`} className="text-brand-700 hover:underline">
                        {order.quotation.number}
                      </Link>
                    ),
                  },
                  { label: "Notes", value: order.notes },
                ]}
              />
            </CardBody>
          </Card>
          <ActivityCard entityType="SalesOrder" entityId={id} />
        </div>
      </div>
    </>
  );
}
