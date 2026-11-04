import type { Metadata } from "next";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { branchWhere } from "@/lib/branch";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { formatMoney } from "@/lib/format";
import { param } from "@/lib/forms";
import { formatDmy, parseDay, todayIso } from "@/lib/ops/dates";
import { ageDocuments } from "../_ar_ap/aging";
import { AdvancesCard, AgingTable, AsOfToolbar } from "../_ar_ap/aging-report";
import { receivablesAsOf } from "../_ar_ap/server";

export const metadata: Metadata = { title: "Aged receivables" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function AgedReceivablesPage({ searchParams }: PageProps<"/finance/aged-receivables">) {
  await requireUser("finance");
  await ensureFinanceSetup();
  const sp = await searchParams;
  const asOf = parseDay(param(sp, "asOf")) || todayIso();
  const party = param(sp, "party");
  const { docs, advances } = await receivablesAsOf(asOf, await branchWhere());
  const aged = ageDocuments(docs, asOf);
  const overdue = aged.total - aged.totals.notDue;
  const advanceTotal = advances.reduce((s, a) => s + a.unapplied, 0);

  const href = (p: string | null) => {
    const q = new URLSearchParams({ asOf });
    if (p) q.set("party", p);
    return `/finance/aged-receivables?${q}`;
  };

  return (
    <>
      <PageHeader title="Aged receivables" description={`Open customer invoices on ${formatDmy(asOf)}, by days past due.`} />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total receivable" value={formatMoney(aged.total)} hint={`${aged.parties.length} customer${aged.parties.length === 1 ? "" : "s"}`} />
        <StatCard label="Overdue" value={formatMoney(overdue)} tone={overdue > 0 ? "warning" : "default"} />
        <StatCard label="Over 90 days" value={formatMoney(aged.totals.d90plus)} tone={aged.totals.d90plus > 0 ? "danger" : "default"} />
        <StatCard label="Unapplied receipts" value={formatMoney(advanceTotal)} hint="Customer advances" />
      </div>
      <div className="space-y-6">
        <Card>
          <CardHeader title="Aging by customer" description="Click a customer to see their invoices." />
          <AsOfToolbar asOf={asOf} exportHref={`/finance/aged-receivables/export?asOf=${asOf}`} />
          <AgingTable
            parties={aged.parties}
            totals={aged.totals}
            total={aged.total}
            partyLabel="Customer"
            selected={party}
            partyHref={href}
            docHref={(id) => `/sales/invoices/${id}`}
          />
        </Card>
        <AdvancesCard
          title="Unapplied receipts"
          description="Money received but not yet applied to an invoice (credited to advances from customers)."
          rows={advances}
          partyLabel="Customer"
        />
      </div>
    </>
  );
}
