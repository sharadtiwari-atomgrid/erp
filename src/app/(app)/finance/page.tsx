import Link from "next/link";
import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { formatMoney } from "@/lib/format";
import { formatDmy } from "@/lib/ops/dates";
import { can } from "@/lib/permissions";
import { postExistingSalesDocuments } from "./_overview/actions";
import { daysPast, loadOverview } from "./_overview/data";
import { RevenueChart } from "./_overview/revenue-chart";
import { SyncSalesButton } from "./_overview/sync-button";

export const metadata: Metadata = { title: "Finance Role Center" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

const QUICK_ACTIONS = [
  { label: "New General Journal", href: "/finance/journals/new" },
  { label: "Cash Receipt Journal", href: "/finance/receipts/new" },
  { label: "New Purchase Invoice", href: "/finance/purchase-invoices/new" },
  { label: "Payment Journal", href: "/finance/vendor-payments/new" },
  { label: "Bank Acc. Reconciliation", href: "/finance/bank-reconciliation" },
  { label: "Calculate Depreciation", href: "/finance/depreciation" },
];

const REPORTS = [
  { label: "Trial Balance", href: "/finance/reports/trial-balance" },
  { label: "Income Statement", href: "/finance/reports/profit-and-loss" },
  { label: "Balance Sheet", href: "/finance/reports/balance-sheet" },
  { label: "Statement of Cash Flows", href: "/finance/reports/cash-flow" },
  { label: "GST Returns", href: "/finance/gst-returns" },
  { label: "TDS & TCS Entries", href: "/finance/tds" },
];

function Tile({ href, ...props }: { href: string } & Parameters<typeof StatCard>[0]) {
  return (
    <Link href={href} className="block rounded-lg transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-600">
      <StatCard {...props} />
    </Link>
  );
}

export default async function FinancePage() {
  const user = await requireUser("finance");
  await ensureFinanceSetup();
  const o = await loadOverview();
  const canEdit = can(user, "finance", "edit");
  const seesSales = can(user, "invoices");

  return (
    <>
      <PageHeader
        title="Finance Role Center"
        description={`Hello ${user.name.split(" ")[0]} · ${formatDmy(o.today)}${o.branchScoped ? " · figures for the selected branch" : ""}`}
        actions={
          <ButtonLink variant="secondary" href="/finance/reports/trial-balance">
            Trial Balance
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile href="/finance/bank-accounts" label="Cash Accounts Balance" value={formatMoney(o.cashBalance)} hint={`Across ${o.cashAccounts} cash and bank ledger accounts`} tone={o.cashBalance < 0 ? "danger" : "default"} />
        <Tile
          href="/finance/aged-receivables"
          label="Sales Invoices Outstanding"
          value={formatMoney(o.receivables.total)}
          hint={`${o.receivables.count} invoices · ${formatMoney(o.receivables.overdue)} overdue (${o.receivables.overdueCount})`}
          tone={o.receivables.overdue > 0 ? "warning" : "default"}
        />
        <Tile
          href="/finance/aged-payables"
          label="Purchase Invoices Outstanding"
          value={formatMoney(o.payables.total)}
          hint={`${o.payables.count} purchase invoices · ${formatMoney(o.payables.dueThisWeek)} due within 7 days (${o.payables.dueThisWeekCount})`}
          tone={o.payables.dueThisWeek > 0 ? "warning" : "default"}
        />
        <Tile
          href="/finance/reports/profit-and-loss"
          label={`Profit · ${o.thisMonth}`}
          value={formatMoney(o.month.profit)}
          hint={`Revenue ${formatMoney(o.month.revenue)} · expenses ${formatMoney(o.month.expenses)}`}
          tone={o.month.profit < 0 ? "danger" : "default"}
        />
        <Tile
          href={`/finance/gst-returns?period=${o.gst.period}&tab=gstr3b`}
          label={`GST payable · ${o.thisMonth}`}
          value={formatMoney(o.gst.payable)}
          hint={`Output ${formatMoney(o.gst.output)} − ITC ${formatMoney(o.gst.itc)}${o.gst.payable < 0 ? " (credit)" : ""}`}
        />
        <Tile
          href="/finance/tds?kind=TDS&status=PENDING&quarter=all"
          label="TDS pending deposit"
          value={formatMoney(o.tds.amount)}
          hint={`${o.tds.count} entries${o.tcs.count ? ` · TCS ${formatMoney(o.tcs.amount)} pending` : ""}`}
          tone={o.tds.amount > 0 ? "warning" : "default"}
        />
        <Card className="sm:col-span-2">
          <CardHeader title={canEdit ? "Actions" : "Financial Reports"} />
          <CardBody className="flex flex-wrap gap-2">
            {canEdit &&
              QUICK_ACTIONS.map((a) => (
                <ButtonLink key={a.href} href={a.href} variant="secondary" size="sm">
                  {a.label}
                </ButtonLink>
              ))}
            {REPORTS.map((a) => (
              <ButtonLink key={a.href} href={a.href} variant="ghost" size="sm">
                {a.label}
              </ButtonLink>
            ))}
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Revenue vs expenses" description="Last six months, from the general ledger (year-end close excluded)." />
          <CardBody>
            <RevenueChart series={o.series} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Overdue Sales Invoices" description="Unpaid invoices past their due date." actions={<Link href="/finance/aged-receivables" className="text-xs font-medium text-brand-700 hover:underline">Aged Accounts Receivable</Link>} />
          {o.topOverdue.length === 0 ? (
            <CardBody>
              <p className="text-sm text-ink-faint">No overdue invoices.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-line">
              {o.topOverdue.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <div className="min-w-0">
                    <Link href={seesSales ? `/sales/invoices?q=${encodeURIComponent(c.name)}&status=OVERDUE` : `/contacts/${c.id}`} className="font-medium text-ink hover:text-brand-700 hover:underline">
                      {c.name}
                    </Link>
                    <p className="text-xs text-ink-soft">
                      {c.invoices} {c.invoices === 1 ? "invoice" : "invoices"} · oldest {daysPast(c.oldestDue, o.today)} days overdue
                    </p>
                  </div>
                  <span className="whitespace-nowrap font-medium tabular-nums text-red-600">{formatMoney(c.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Purch. Invoices Due Next 14 Days" description="Purchase invoices due in the next 14 days or already overdue." actions={<Link href="/finance/aged-payables" className="text-xs font-medium text-brand-700 hover:underline">Aged Accounts Payable</Link>} />
          {o.billsDueSoon.length === 0 ? (
            <CardBody>
              <p className="text-sm text-ink-faint">Nothing due in the next two weeks.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-line">
              {o.billsDueSoon.map((b) => {
                const late = b.due && b.due < o.today;
                return (
                  <li key={b.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <div className="min-w-0">
                      <Link href={`/finance/purchase-invoices/${b.id}`} className="font-medium text-ink hover:text-brand-700 hover:underline">
                        {b.supplier.name}
                      </Link>
                      <p className="text-xs text-ink-soft">
                        {b.number}
                        {b.supplierInvoiceNo ? ` · ${b.supplierInvoiceNo}` : ""} ·{" "}
                        <span className={late ? "text-red-600" : ""}>{b.due ? `due ${formatDmy(b.due)}` : "no due date"}</span>
                      </p>
                    </div>
                    <span className="whitespace-nowrap font-medium tabular-nums">{formatMoney(b.balance)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent G/L Postings" description="Journals, receipts and payments." actions={<Link href="/finance/entries" className="text-xs font-medium text-brand-700 hover:underline">General Ledger Entries</Link>} />
          {o.recent.length === 0 ? (
            <CardBody>
              <p className="text-sm text-ink-faint">Nothing posted yet.</p>
            </CardBody>
          ) : (
            <ul className="divide-y divide-line">
              {o.recent.map((t) => (
                <li key={t.transactionNo} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">
                      {t.type}
                      {t.documentNo ? ` ${t.documentNo}` : ""}
                      {t.party ? <span className="font-normal text-ink-soft"> · {t.party}</span> : null}
                    </p>
                    <p className="truncate text-xs text-ink-soft">
                      {formatDmy(t.date)} · Tx {t.transactionNo}
                      {t.description ? ` · ${t.description}` : ""}
                    </p>
                  </div>
                  <span className="whitespace-nowrap tabular-nums">{formatMoney(t.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {canEdit && (
        <Card className="mt-6">
          <CardHeader
            title="Sales ledger sync"
            description="Posts issued sales invoices and their payments that are not in the general ledger yet (e.g. created before Finance was set up). Safe to run again: documents already posted are skipped."
          />
          <CardBody>
            <SyncSalesButton action={postExistingSalesDocuments} />
          </CardBody>
        </Card>
      )}
    </>
  );
}
