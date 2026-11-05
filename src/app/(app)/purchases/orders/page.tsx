import Link from "next/link";
import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListToolbar, Pagination } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney, humanize } from "@/lib/format";
import { pagination, param } from "@/lib/forms";
import { can } from "@/lib/permissions";
import type { Prisma } from "@/generated/prisma/client";
import { PurchaseOrderStatus } from "@/generated/prisma/enums";

export const instant = false;
export const metadata: Metadata = { title: "Purchase Orders" };

export default async function PurchaseOrdersPage({ searchParams }: PageProps<"/purchases/orders">) {
  const user = await requireUser("finance");
  const sp = await searchParams;
  const q = param(sp, "q");
  const status = param(sp, "status");
  const { page, take, skip } = pagination(sp);
  const statusFilter = Object.values(PurchaseOrderStatus).includes(status as PurchaseOrderStatus) ? status as PurchaseOrderStatus : undefined;
  const where: Prisma.PurchaseOrderWhereInput = {
    ...(q && { OR: [{ number: { contains: q, mode: "insensitive" } }, { supplier: { name: { contains: q, mode: "insensitive" } } }, { supplier: { code: { contains: q, mode: "insensitive" } } }] }),
    ...(statusFilter && { status: statusFilter }),
  };
  const [orders, total] = await Promise.all([
    db.purchaseOrder.findMany({ where, orderBy: { createdAt: "desc" }, take, skip, include: { supplier: { select: { id: true, name: true } }, warehouse: { select: { code: true } } } }),
    db.purchaseOrder.count({ where }),
  ]);
  return <>
    <PageHeader title="Purchase Orders" description="Create, track, receive and invoice supplier orders." actions={can(user, "finance", "edit") && <ButtonLink href="/purchases/orders/new">New Purchase Order</ButtonLink>} />
    <Card>
      <ListToolbar q={q} placeholder="Search number or vendor" filter={{ name: "status", value: status, allLabel: "All statuses", options: Object.values(PurchaseOrderStatus).map(s => ({ value: s, label: humanize(s) })) }} />
      <Table>
        <THead><tr><TH>No.</TH><TH>Vendor</TH><TH>Location</TH><TH>Order Date</TH><TH>Expected Receipt</TH><TH>Status</TH><TH align="right">Total</TH></tr></THead>
        <TBody>
          {orders.length === 0 && <EmptyRow colSpan={7}>No purchase orders found.</EmptyRow>}
          {orders.map(o => <TR key={o.id}>
            <TD><Link href={"/purchases/orders/" + o.id} className="font-medium text-brand-700 hover:underline">{o.number}</Link></TD>
            <TD><Link href={"/contacts/" + o.supplier.id} className="hover:underline">{o.supplier.name}</Link></TD>
            <TD className="font-mono text-xs text-ink-soft">{o.warehouse.code}</TD>
            <TD className="text-ink-soft">{formatDate(o.orderDate)}</TD>
            <TD className="text-ink-soft">{formatDate(o.expectedReceiptDate)}</TD>
            <TD><StatusBadge status={o.status} /></TD>
            <TD align="right">{formatMoney(o.total)}</TD>
          </TR>)}
        </TBody>
      </Table>
      <Pagination page={page} pageSize={take} total={total} searchParams={sp} />
    </Card>
  </>;
}
