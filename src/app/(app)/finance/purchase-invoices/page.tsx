import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma } from "@/generated/prisma/client";
import { PurchaseInvoiceStatus } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { ListToolbar, Pagination } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { branchWhere } from "@/lib/branch";
import { db } from "@/lib/db";
import { money } from "@/lib/finance/chart";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { formatMoney, humanize, num } from "@/lib/format";
import { pagination, param } from "@/lib/forms";
import { addDaysIso, dayFromIso, formatDmy, isoFromDay, todayIso } from "@/lib/ops/dates";
import { can } from "@/lib/permissions";
import { dueWithin, overdue } from "../_ar_ap/aging";
import { DocStatus } from "../_ar_ap/ui";

export const metadata: Metadata = { title: "Purchase invoices" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

const OPEN: PurchaseInvoiceStatus[] = ["POSTED", "PARTIALLY_PAID"];

export default async function PurchaseInvoicesPage({ searchParams }: PageProps<"/finance/purchase-invoices">) {
  const user = await requireUser("finance");
  await ensureFinanceSetup();
  const sp = await searchParams;
  const q = param(sp, "q");
  const status = param(sp, "status");
  const { page, take, skip } = pagination(sp);
  const today = todayIso();
  const branch = await branchWhere();
  const statusFilter = (Object.values(PurchaseInvoiceStatus) as string[]).includes(status) ? (status as PurchaseInvoiceStatus) : null;

  const where: Prisma.PurchaseInvoiceWhereInput = {
    ...branch,
    ...(q && {
      OR: [
        { number: { contains: q, mode: "insensitive" } },
        { supplierInvoiceNo: { contains: q, mode: "insensitive" } },
        { supplier: { name: { contains: q, mode: "insensitive" } } },
      ],
    }),
    ...(statusFilter && { status: statusFilter }),
    ...(status === "OVERDUE" && { status: { in: OPEN }, dueDate: { lt: dayFromIso(today) } }),
    ...(status === "DUE_WEEK" && { status: { in: OPEN }, dueDate: { gte: dayFromIso(today), lte: dayFromIso(addDaysIso(today, 6)) } }),
  };

  const [bills, total, open, drafts] = await Promise.all([
    db.purchaseInvoice.findMany({
      where,
      orderBy: [{ invoiceDate: "desc" }, { number: "desc" }],
      take,
      skip,
      include: { supplier: { select: { id: true, name: true } } },
    }),
    db.purchaseInvoice.count({ where }),
    db.purchaseInvoice.findMany({ where: { ...branch, status: { in: OPEN } }, select: { invoiceDate: true, dueDate: true, total: true, amountPaid: true } }),
    db.purchaseInvoice.count({ where: { ...branch, status: "DRAFT" } }),
  ]);

  const openDocs = open.map((b) => ({ docDate: isoFromDay(b.invoiceDate), dueDate: b.dueDate ? isoFromDay(b.dueDate) : null, balance: money(num(b.total) - num(b.amountPaid)) }));
  const sum = (rows: typeof openDocs) => money(rows.reduce((s, r) => s + r.balance, 0));
  const dueWeek = dueWithin(openDocs, today, 7);
  const late = overdue(openDocs, today);

  return (
    <>
      <PageHeader
        title="Purchase invoices"
        description="Supplier bills for goods, services, expenses and assets, posted to payables."
        actions={
          <>
            <ButtonLink href="/finance/vendor-payments" variant="secondary">
              Vendor payments
            </ButtonLink>
            {can(user, "finance", "edit") && <ButtonLink href="/finance/purchase-invoices/new">New purchase invoice</ButtonLink>}
          </>
        }
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open payables" value={formatMoney(sum(openDocs))} hint={`${openDocs.length} unpaid bill${openDocs.length === 1 ? "" : "s"}`} />
        <Link href="/finance/purchase-invoices?status=DUE_WEEK" className="block rounded-lg focus-visible:outline-2 focus-visible:outline-brand-600">
          <StatCard label="Bills due this week" value={formatMoney(sum(dueWeek))} hint={`${dueWeek.length} bill${dueWeek.length === 1 ? "" : "s"} due by ${formatDmy(addDaysIso(today, 6))}`} tone={dueWeek.length ? "warning" : "default"} />
        </Link>
        <Link href="/finance/purchase-invoices?status=OVERDUE" className="block rounded-lg focus-visible:outline-2 focus-visible:outline-brand-600">
          <StatCard label="Overdue" value={formatMoney(sum(late))} hint={`${late.length} bill${late.length === 1 ? "" : "s"}`} tone={late.length ? "danger" : "default"} />
        </Link>
        <Link href="/finance/purchase-invoices?status=DRAFT" className="block rounded-lg focus-visible:outline-2 focus-visible:outline-brand-600">
          <StatCard label="Drafts to post" value={drafts} />
        </Link>
      </div>
      <Card>
        <ListToolbar
          q={q}
          placeholder="Search number, supplier or supplier invoice"
          filter={{
            name: "status",
            value: status,
            allLabel: "All statuses",
            options: [
              ...Object.values(PurchaseInvoiceStatus).map((s) => ({ value: s, label: humanize(s) })),
              { value: "DUE_WEEK", label: "Due this week" },
              { value: "OVERDUE", label: "Overdue" },
            ],
          }}
        />
        <Table>
          <THead>
            <tr>
              <TH>Number</TH>
              <TH>Supplier</TH>
              <TH>Supplier inv.</TH>
              <TH>Date</TH>
              <TH>Due</TH>
              <TH>Status</TH>
              <TH align="right">Total</TH>
              <TH align="right">Balance</TH>
            </tr>
          </THead>
          <TBody>
            {bills.length === 0 && <EmptyRow colSpan={8}>No purchase invoices.</EmptyRow>}
            {bills.map((b) => {
              const balance = money(num(b.total) - num(b.amountPaid));
              const isOpen = OPEN.includes(b.status);
              const late = isOpen && b.dueDate && isoFromDay(b.dueDate) < today;
              return (
                <TR key={b.id}>
                  <TD>
                    <Link href={`/finance/purchase-invoices/${b.id}`} className="font-medium text-brand-700 hover:underline">
                      {b.number}
                    </Link>
                  </TD>
                  <TD>
                    <Link href={`/contacts/${b.supplier.id}`} className="hover:underline">
                      {b.supplier.name}
                    </Link>
                  </TD>
                  <TD className="text-ink-soft">{b.supplierInvoiceNo ?? "—"}</TD>
                  <TD className="text-ink-soft">{formatDmy(b.invoiceDate)}</TD>
                  <TD className={late ? "text-red-600" : "text-ink-soft"}>{formatDmy(b.dueDate) || "—"}</TD>
                  <TD>
                    <span className="flex gap-1.5">
                      <DocStatus status={b.status} />
                      {late && <Badge tone="red">Overdue</Badge>}
                    </span>
                  </TD>
                  <TD align="right">{formatMoney(b.total)}</TD>
                  <TD align="right">{b.status === "CANCELLED" || b.status === "DRAFT" ? "—" : formatMoney(balance)}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        <Pagination page={page} pageSize={take} total={total} searchParams={sp} />
      </Card>
    </>
  );
}
