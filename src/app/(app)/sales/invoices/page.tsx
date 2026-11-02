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
import { formatDate, formatMoney, humanize, num } from "@/lib/format";
import { pagination, param } from "@/lib/forms";
import { can } from "@/lib/permissions";
import type { Prisma } from "@/generated/prisma/client";
import { InvoiceStatus } from "@/generated/prisma/enums";
import { enumParam, isOverdue, startOfToday } from "../_lib/documents";
import { branchWhere } from "@/lib/branch";

export const metadata: Metadata = { title: "Invoices" };

export default async function InvoicesPage({ searchParams }: PageProps<"/sales/invoices">) {
  const user = await requireUser("invoices");
  const sp = await searchParams;
  const q = param(sp, "q");
  const status = param(sp, "status");
  const statusFilter = enumParam(InvoiceStatus, status);
  const { page, take, skip } = pagination(sp);
  const today = startOfToday();

  const where: Prisma.InvoiceWhereInput = {
    ...(await branchWhere()),
    ...(q && {
      OR: [
        { number: { contains: q, mode: "insensitive" } },
        { customer: { name: { contains: q, mode: "insensitive" } } },
        { customer: { code: { contains: q, mode: "insensitive" } } },
      ],
    }),
    ...(statusFilter && { status: statusFilter }),
    ...(status === "OVERDUE" && { status: { in: ["ISSUED", "PARTIALLY_PAID"] }, dueDate: { lt: today } }),
  };

  const [invoices, total] = await Promise.all([
    db.invoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: { customer: { select: { id: true, name: true } } },
    }),
    db.invoice.count({ where }),
  ]);

  return (
    <>
      <PageHeader
        title="Invoices"
        description="GST tax invoices and customer payments."
        actions={can(user, "invoices", "edit") && <ButtonLink href="/sales/invoices/new">New invoice</ButtonLink>}
      />
      <Card>
        <ListToolbar
          q={q}
          placeholder="Search number or customer"
          filter={{
            name: "status",
            value: status,
            allLabel: "All statuses",
            options: [
              ...Object.values(InvoiceStatus).map((s) => ({ value: s, label: humanize(s) })),
              { value: "OVERDUE", label: "Overdue" },
            ],
          }}
        />
        <Table>
          <THead>
            <tr>
              <TH>Number</TH>
              <TH>Customer</TH>
              <TH>Issued</TH>
              <TH>Due</TH>
              <TH>Status</TH>
              <TH align="right">Total</TH>
              <TH align="right">Balance</TH>
            </tr>
          </THead>
          <TBody>
            {invoices.length === 0 && <EmptyRow colSpan={7} />}
            {invoices.map((inv) => (
              <TR key={inv.id}>
                <TD>
                  <Link href={`/sales/invoices/${inv.id}`} className="font-medium text-brand-700 hover:underline">
                    {inv.number}
                  </Link>
                </TD>
                <TD>
                  <Link href={`/contacts/${inv.customer.id}`} className="hover:underline">
                    {inv.customer.name}
                  </Link>
                </TD>
                <TD className="text-ink-soft">{formatDate(inv.issueDate)}</TD>
                <TD className="text-ink-soft">{formatDate(inv.dueDate)}</TD>
                <TD>
                  <span className="flex gap-1.5">
                    <StatusBadge status={inv.status} />
                    {isOverdue(inv, today) && <StatusBadge status="OVERDUE" />}
                  </span>
                </TD>
                <TD align="right">{formatMoney(inv.total)}</TD>
                <TD align="right">{inv.status === "CANCELLED" ? "—" : formatMoney(num(inv.total) - num(inv.amountPaid))}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <Pagination page={page} pageSize={take} total={total} searchParams={sp} />
      </Card>
    </>
  );
}
