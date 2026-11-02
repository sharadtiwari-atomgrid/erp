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
import { SalesOrderStatus } from "@/generated/prisma/enums";
import { enumParam } from "../_lib/documents";

export const metadata: Metadata = { title: "Sales orders" };

export default async function SalesOrdersPage({ searchParams }: PageProps<"/sales/orders">) {
  const user = await requireUser("salesOrders");
  const sp = await searchParams;
  const q = param(sp, "q");
  const status = param(sp, "status");
  const statusFilter = enumParam(SalesOrderStatus, status);
  const { page, take, skip } = pagination(sp);

  const where: Prisma.SalesOrderWhereInput = {
    ...(q && {
      OR: [
        { number: { contains: q, mode: "insensitive" } },
        { customer: { name: { contains: q, mode: "insensitive" } } },
        { customer: { code: { contains: q, mode: "insensitive" } } },
      ],
    }),
    ...(statusFilter && { status: statusFilter }),
  };

  const [orders, total] = await Promise.all([
    db.salesOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: { customer: { select: { id: true, name: true } }, warehouse: { select: { code: true } } },
    }),
    db.salesOrder.count({ where }),
  ]);

  return (
    <>
      <PageHeader
        title="Sales orders"
        description="Confirmed customer orders, deliveries and invoicing."
        actions={can(user.role, "salesOrders", "edit") && <ButtonLink href="/sales/orders/new">New sales order</ButtonLink>}
      />
      <Card>
        <ListToolbar
          q={q}
          placeholder="Search number or customer"
          filter={{
            name: "status",
            value: status,
            allLabel: "All statuses",
            options: Object.values(SalesOrderStatus).map((s) => ({ value: s, label: humanize(s) })),
          }}
        />
        <Table>
          <THead>
            <tr>
              <TH>Number</TH>
              <TH>Customer</TH>
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
                  <Link href={`/sales/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">
                    {o.number}
                  </Link>
                </TD>
                <TD>
                  <Link href={`/crm/customers/${o.customer.id}`} className="hover:underline">
                    {o.customer.name}
                  </Link>
                </TD>
                <TD className="font-mono text-xs text-ink-soft">{o.warehouse.code}</TD>
                <TD className="text-ink-soft">{formatDate(o.orderDate)}</TD>
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
