import Link from "next/link";
import type { Metadata } from "next";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListToolbar, Pagination } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney, humanize } from "@/lib/format";
import { pagination, param } from "@/lib/forms";
import { can } from "@/lib/permissions";
import { PurchaseOrderStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Purchase orders" };

export default async function PurchaseOrdersPage({ searchParams }: PageProps<"/purchasing/orders">) {
  const user = await requireUser("purchaseOrders");
  const sp = await searchParams;
  const q = param(sp, "q");
  const status = param(sp, "status");
  const { page, take, skip } = pagination(sp);

  const where: Prisma.PurchaseOrderWhereInput = {
    ...(q && {
      OR: [
        { number: { contains: q, mode: "insensitive" } },
        { supplier: { name: { contains: q, mode: "insensitive" } } },
        { supplier: { code: { contains: q, mode: "insensitive" } } },
      ],
    }),
    ...(Object.hasOwn(PurchaseOrderStatus, status) && { status: status as PurchaseOrderStatus }),
  };

  const [orders, total] = await Promise.all([
    db.purchaseOrder.findMany({
      where,
      orderBy: [{ orderDate: "desc" }, { number: "desc" }],
      take,
      skip,
      include: { supplier: { select: { name: true } }, warehouse: { select: { code: true } } },
    }),
    db.purchaseOrder.count({ where }),
  ]);

  return (
    <>
      <PageHeader
        title="Purchase orders"
        description="Orders placed with suppliers and goods received against them."
        actions={can(user.role, "purchaseOrders", "edit") && <ButtonLink href="/purchasing/orders/new">New purchase order</ButtonLink>}
      />
      <Card>
        <ListToolbar
          q={q}
          placeholder="Search number or supplier"
          filter={{
            name: "status",
            value: status,
            allLabel: "All statuses",
            options: Object.values(PurchaseOrderStatus).map((s) => ({ value: s, label: humanize(s) })),
          }}
        />
        <Table>
          <THead>
            <tr>
              <TH>Number</TH>
              <TH>Supplier</TH>
              <TH>Warehouse</TH>
              <TH>Order date</TH>
              <TH>Expected</TH>
              <TH>Status</TH>
              <TH align="right">Total</TH>
            </tr>
          </THead>
          <TBody>
            {orders.length === 0 && <EmptyRow colSpan={7} />}
            {orders.map((o) => (
              <TR key={o.id}>
                <TD>
                  <Link href={`/purchasing/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">
                    {o.number}
                  </Link>
                </TD>
                <TD>
                  <Link href={`/purchasing/suppliers/${o.supplierId}`} className="hover:underline">
                    {o.supplier.name}
                  </Link>
                </TD>
                <TD className="font-mono text-xs">{o.warehouse.code}</TD>
                <TD>{formatDate(o.orderDate)}</TD>
                <TD className="text-ink-soft">{formatDate(o.expectedDate)}</TD>
                <TD>
                  <StatusBadge status={o.status} />
                </TD>
                <TD align="right">{formatMoney(o.total)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <Pagination page={page} pageSize={take} total={total} searchParams={sp} />
      </Card>
    </>
  );
}
