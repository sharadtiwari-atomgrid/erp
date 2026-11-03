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
import { QuotationStatus } from "@/generated/prisma/enums";
import { enumParam, isExpired, startOfToday } from "../_lib/documents";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Quotations" };

export default async function QuotationsPage({ searchParams }: PageProps<"/sales/quotations">) {
  const user = await requireUser("quotations");
  const sp = await searchParams;
  const q = param(sp, "q");
  const status = param(sp, "status");
  const statusFilter = enumParam(QuotationStatus, status);
  const { page, take, skip } = pagination(sp);
  const today = startOfToday();

  const where: Prisma.QuotationWhereInput = {
    ...(q && {
      OR: [
        { number: { contains: q, mode: "insensitive" } },
        { customer: { name: { contains: q, mode: "insensitive" } } },
        { customer: { code: { contains: q, mode: "insensitive" } } },
      ],
    }),
    ...(statusFilter && { status: statusFilter }),
  };

  const [quotations, total] = await Promise.all([
    db.quotation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: { customer: { select: { id: true, name: true } } },
    }),
    db.quotation.count({ where }),
  ]);

  return (
    <>
      <PageHeader
        title="Quotations"
        description="Price offers sent to customers."
        actions={can(user, "quotations", "edit") && <ButtonLink href="/sales/quotations/new">New quotation</ButtonLink>}
      />
      <Card>
        <ListToolbar
          q={q}
          placeholder="Search number or customer"
          filter={{
            name: "status",
            value: status,
            allLabel: "All statuses",
            options: Object.values(QuotationStatus).map((s) => ({ value: s, label: humanize(s) })),
          }}
        />
        <Table>
          <THead>
            <tr>
              <TH>Number</TH>
              <TH>Customer</TH>
              <TH>Date</TH>
              <TH>Valid until</TH>
              <TH>Status</TH>
              <TH align="right">Total</TH>
            </tr>
          </THead>
          <TBody>
            {quotations.length === 0 && <EmptyRow colSpan={6} />}
            {quotations.map((qt) => (
              <TR key={qt.id}>
                <TD>
                  <Link href={`/sales/quotations/${qt.id}`} className="font-medium text-brand-700 hover:underline">
                    {qt.number}
                  </Link>
                </TD>
                <TD>
                  <Link href={`/contacts/${qt.customer.id}`} className="hover:underline">
                    {qt.customer.name}
                  </Link>
                </TD>
                <TD className="text-ink-soft">{formatDate(qt.issueDate)}</TD>
                <TD className="text-ink-soft">{formatDate(qt.validUntil)}</TD>
                <TD>
                  <span className="flex gap-1.5">
                    <StatusBadge status={qt.status} />
                    {isExpired(qt, today) && <StatusBadge status="EXPIRED" />}
                  </span>
                </TD>
                <TD align="right">{formatMoney(qt.total)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <Pagination page={page} pageSize={take} total={total} searchParams={sp} />
      </Card>
    </>
  );
}
