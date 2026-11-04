import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma } from "@/generated/prisma/client";
import { ButtonLink } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { ListToolbar, Pagination } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { formatMoney, humanize, num } from "@/lib/format";
import { pagination, param } from "@/lib/forms";
import { dayFromIso, formatDmy, todayIso } from "@/lib/ops/dates";
import { can } from "@/lib/permissions";
import { Amount, DocStatus } from "../_ar_ap/ui";

export const metadata: Metadata = { title: "Cash receipts" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

const STATUSES = ["DRAFT", "POSTED", "CANCELLED"];

export default async function ReceiptsPage({ searchParams }: PageProps<"/finance/receipts">) {
  const user = await requireUser("finance");
  await ensureFinanceSetup();
  const sp = await searchParams;
  const q = param(sp, "q");
  const status = param(sp, "status");
  const { page, take, skip } = pagination(sp);
  const today = todayIso();
  const monthStart = dayFromIso(`${today.slice(0, 7)}-01`);

  const where: Prisma.CashReceiptWhereInput = {
    ...(q && {
      OR: [
        { number: { contains: q, mode: "insensitive" } },
        { reference: { contains: q, mode: "insensitive" } },
        { customer: { name: { contains: q, mode: "insensitive" } } },
      ],
    }),
    ...(STATUSES.includes(status) && { status }),
  };

  const [receipts, total, month, advances] = await Promise.all([
    db.cashReceipt.findMany({
      where,
      orderBy: [{ date: "desc" }, { number: "desc" }],
      take,
      skip,
      include: { customer: { select: { id: true, name: true } }, bankAccount: { select: { name: true } } },
    }),
    db.cashReceipt.count({ where }),
    db.cashReceipt.aggregate({ where: { status: "POSTED", date: { gte: monthStart } }, _sum: { amount: true }, _count: true }),
    db.cashReceipt.aggregate({ where: { status: "POSTED", unappliedAmount: { gt: 0 } }, _sum: { unappliedAmount: true }, _count: true }),
  ]);

  return (
    <>
      <PageHeader
        title="Cash receipts"
        description="Money received from customers, applied to their open invoices and posted to bank or cash."
        actions={
          <>
            <ButtonLink href="/finance/aged-receivables" variant="secondary">
              Aged receivables
            </ButtonLink>
            {can(user, "finance", "edit") && <ButtonLink href="/finance/receipts/new">New receipt</ButtonLink>}
          </>
        }
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard label="Received this month" value={formatMoney(month._sum.amount)} hint={`${month._count} posted receipt${month._count === 1 ? "" : "s"}`} />
        <StatCard label="Customer advances (unapplied)" value={formatMoney(advances._sum.unappliedAmount)} hint={`${advances._count} receipt${advances._count === 1 ? "" : "s"}`} />
      </div>
      <Card>
        <ListToolbar
          q={q}
          placeholder="Search number, customer or reference"
          filter={{ name: "status", value: status, allLabel: "All statuses", options: STATUSES.map((s) => ({ value: s, label: humanize(s) })) }}
        />
        <Table>
          <THead>
            <tr>
              <TH>Number</TH>
              <TH>Date</TH>
              <TH>Customer</TH>
              <TH>Deposited to</TH>
              <TH>Method</TH>
              <TH>Status</TH>
              <TH align="right">Amount</TH>
              <TH align="right">TDS</TH>
              <TH align="right">Unapplied</TH>
            </tr>
          </THead>
          <TBody>
            {receipts.length === 0 && <EmptyRow colSpan={9}>No receipts yet.</EmptyRow>}
            {receipts.map((r) => (
              <TR key={r.id}>
                <TD>
                  <Link href={`/finance/receipts/${r.id}`} className="font-medium text-brand-700 hover:underline">
                    {r.number}
                  </Link>
                </TD>
                <TD className="text-ink-soft">{formatDmy(r.date)}</TD>
                <TD>
                  <Link href={`/contacts/${r.customer.id}`} className="hover:underline">
                    {r.customer.name}
                  </Link>
                </TD>
                <TD className="text-ink-soft">{r.bankAccount.name}</TD>
                <TD className="text-ink-soft">{r.method === "UPI" ? "UPI" : humanize(r.method)}</TD>
                <TD>
                  <DocStatus status={r.status} />
                </TD>
                <TD align="right">{formatMoney(r.amount)}</TD>
                <TD align="right">
                  <Amount value={num(r.tdsAmount)} dashZero />
                </TD>
                <TD align="right">
                  <Amount value={r.status === "POSTED" ? num(r.unappliedAmount) : 0} dashZero />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <Pagination page={page} pageSize={take} total={total} searchParams={sp} />
      </Card>
    </>
  );
}
