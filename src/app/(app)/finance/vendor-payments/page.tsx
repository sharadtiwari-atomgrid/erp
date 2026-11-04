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

export const metadata: Metadata = { title: "Vendor payments" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

const STATUSES = ["DRAFT", "POSTED", "CANCELLED"];

export default async function VendorPaymentsPage({ searchParams }: PageProps<"/finance/vendor-payments">) {
  const user = await requireUser("finance");
  await ensureFinanceSetup();
  const sp = await searchParams;
  const q = param(sp, "q");
  const status = param(sp, "status");
  const { page, take, skip } = pagination(sp);
  const today = todayIso();
  const monthStart = dayFromIso(`${today.slice(0, 7)}-01`);

  const where: Prisma.VendorPaymentWhereInput = {
    ...(q && {
      OR: [
        { number: { contains: q, mode: "insensitive" } },
        { reference: { contains: q, mode: "insensitive" } },
        { supplier: { name: { contains: q, mode: "insensitive" } } },
      ],
    }),
    ...(STATUSES.includes(status) && { status }),
  };

  const [payments, total, month, advances] = await Promise.all([
    db.vendorPayment.findMany({
      where,
      orderBy: [{ date: "desc" }, { number: "desc" }],
      take,
      skip,
      include: { supplier: { select: { id: true, name: true } }, bankAccount: { select: { name: true } }, tdsSection: { select: { code: true } } },
    }),
    db.vendorPayment.count({ where }),
    db.vendorPayment.aggregate({ where: { status: "POSTED", date: { gte: monthStart } }, _sum: { amount: true, tdsAmount: true }, _count: true }),
    db.vendorPayment.aggregate({ where: { status: "POSTED", unappliedAmount: { gt: 0 } }, _sum: { unappliedAmount: true }, _count: true }),
  ]);
  const canEdit = can(user, "finance", "edit");

  return (
    <>
      <PageHeader
        title="Vendor payments"
        description="Payments to suppliers and transporters, applied to their bills, with TDS withheld."
        actions={
          <>
            <ButtonLink href="/b2b/transport/payables" variant="secondary">
              Pay transporters
            </ButtonLink>
            <ButtonLink href="/finance/aged-payables" variant="secondary">
              Aged payables
            </ButtonLink>
            {canEdit && <ButtonLink href="/finance/vendor-payments/new">New payment</ButtonLink>}
          </>
        }
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Paid this month" value={formatMoney(month._sum.amount)} hint={`${month._count} posted payment${month._count === 1 ? "" : "s"}`} />
        <StatCard label="TDS withheld this month" value={formatMoney(month._sum.tdsAmount)} hint="Due to the government by the 7th" />
        <StatCard label="Advances to suppliers" value={formatMoney(advances._sum.unappliedAmount)} hint={`${advances._count} payment${advances._count === 1 ? "" : "s"}`} />
      </div>
      <Card>
        <ListToolbar
          q={q}
          placeholder="Search number, supplier or reference"
          filter={{ name: "status", value: status, allLabel: "All statuses", options: STATUSES.map((s) => ({ value: s, label: humanize(s) })) }}
        />
        <Table>
          <THead>
            <tr>
              <TH>Number</TH>
              <TH>Date</TH>
              <TH>Supplier</TH>
              <TH>Paid from</TH>
              <TH>Method</TH>
              <TH>Status</TH>
              <TH align="right">Paid</TH>
              <TH align="right">TDS</TH>
              <TH align="right">Advance</TH>
            </tr>
          </THead>
          <TBody>
            {payments.length === 0 && <EmptyRow colSpan={9}>No vendor payments yet.</EmptyRow>}
            {payments.map((p) => (
              <TR key={p.id}>
                <TD>
                  <Link href={`/finance/vendor-payments/${p.id}`} className="font-medium text-brand-700 hover:underline">
                    {p.number}
                  </Link>
                </TD>
                <TD className="text-ink-soft">{formatDmy(p.date)}</TD>
                <TD>
                  <Link href={`/contacts/${p.supplier.id}`} className="hover:underline">
                    {p.supplier.name}
                  </Link>
                </TD>
                <TD className="text-ink-soft">{p.bankAccount.name}</TD>
                <TD className="text-ink-soft">{p.method === "UPI" ? "UPI" : humanize(p.method)}</TD>
                <TD>
                  <DocStatus status={p.status} />
                </TD>
                <TD align="right">{formatMoney(p.amount)}</TD>
                <TD align="right">
                  <Amount value={num(p.tdsAmount)} dashZero />
                  {p.tdsSection && <span className="ml-1 text-xs text-ink-faint">{p.tdsSection.code}</span>}
                </TD>
                <TD align="right">
                  <Amount value={num(p.unappliedAmount)} dashZero />
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
