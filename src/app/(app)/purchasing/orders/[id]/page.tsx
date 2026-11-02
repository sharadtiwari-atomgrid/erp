import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/app/(app)/inventory/_components/action-button";
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
    db.stockMovement.findMany({
      where: { referenceType: "PurchaseOrder", referenceId: id },
      orderBy: { createdAt: "desc" },
      include: { product: { select: { sku: true, name: true, unit: true } }, createdBy: { select: { name: true } } },
    }),
    db.activity.findMany({
      where: { entityType: "PurchaseOrder", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { user: { select: { name: true } } },
    }),
  ]);

  const canEdit = can(user.role, "purchaseOrders", "edit");
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
            {isOpen && canReceiveGoods(user.role) && <ButtonLink href={`/purchasing/orders/${id}/receive`}>Receive goods</ButtonLink>}
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
          value={formatDate(order.expectedDate)}
          tone={isOpen && order.expectedDate && order.expectedDate < new Date() ? "danger" : "default"}
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
                    <Link href={`/purchasing/suppliers/${order.supplier.id}`} className="font-medium text-brand-700 hover:underline">
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
            <CardHeader title="Goods received" description="Stock receipts posted against this order" />
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Product</TH>
                  <TH align="right">Qty</TH>
                  <TH align="right">Unit cost</TH>
                  <TH>By</TH>
                </tr>
              </THead>
              <TBody>
                {receipts.length === 0 && <EmptyRow colSpan={5}>Nothing received yet.</EmptyRow>}
                {receipts.map((m) => (
                  <TR key={m.id}>
                    <TD className="whitespace-nowrap text-ink-soft">{formatDateTime(m.createdAt)}</TD>
                    <TD>
                      {m.product.name}
                      <div className="font-mono text-xs text-ink-faint">{m.product.sku}</div>
                      {m.note && <div className="text-xs text-ink-soft">{m.note}</div>}
                    </TD>
                    <TD align="right">
                      {formatNumber(m.quantity)} <span className="text-xs text-ink-faint">{m.product.unit}</span>
                    </TD>
                    <TD align="right">{m.unitCost === null ? "—" : formatMoney(m.unitCost)}</TD>
                    <TD className="text-ink-soft">{m.createdBy?.name ?? "System"}</TD>
                  </TR>
                ))}
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
