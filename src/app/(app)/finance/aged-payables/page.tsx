import Link from "next/link";
import type { Metadata } from "next";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { branchWhere } from "@/lib/branch";
import { money } from "@/lib/finance/chart";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { formatMoney } from "@/lib/format";
import { param } from "@/lib/forms";
import { addDaysIso, formatDmy, parseDay, todayIso } from "@/lib/ops/dates";
import { ageDocuments, dueWithin } from "../_ar_ap/aging";
import { AdvancesCard, AgingTable, AsOfToolbar } from "../_ar_ap/aging-report";
import { payablesAsOf } from "../_ar_ap/server";

export const metadata: Metadata = { title: "Aged Accounts Payable" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function AgedPayablesPage({ searchParams }: PageProps<"/finance/aged-payables">) {
  await requireUser("finance");
  await ensureFinanceSetup();
  const sp = await searchParams;
  const asOf = parseDay(param(sp, "asOf")) || todayIso();
  const party = param(sp, "party");
  const due = param(sp, "due") === "30" ? 30 : 7;
  const { docs, advances } = await payablesAsOf(asOf, await branchWhere());
  const aged = ageDocuments(docs, asOf);
  const overdue = money(aged.total - aged.totals.notDue);
  const due7 = dueWithin(docs, asOf, 7);
  const due30 = dueWithin(docs, asOf, 30);
  const dueList = (due === 30 ? due30 : due7).sort((a, b) => (a.dueDate || a.docDate).localeCompare(b.dueDate || b.docDate));
  const sum = (rows: typeof docs) => money(rows.reduce((s, r) => s + r.balance, 0));

  const href = (p: { party?: string | null; due?: number }) => {
    const q = new URLSearchParams({ asOf });
    const partyValue = p.party === undefined ? party : p.party;
    if (partyValue) q.set("party", partyValue);
    q.set("due", String(p.due ?? due));
    return `/finance/aged-payables?${q}`;
  };

  return (
    <>
      <PageHeader title="Aged Accounts Payable" description={`Open purchase invoices on ${formatDmy(asOf)}, by days past due.`} />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total payable" value={formatMoney(aged.total)} hint={`${aged.parties.length} vendor${aged.parties.length === 1 ? "" : "s"}`} />
        <StatCard label="Overdue" value={formatMoney(overdue)} tone={overdue > 0 ? "danger" : "default"} />
        <StatCard label="Due in next 7 days" value={formatMoney(sum(due7))} hint={`${due7.length} purchase invoice${due7.length === 1 ? "" : "s"}`} tone={due7.length ? "warning" : "default"} />
        <StatCard label="Due in next 30 days" value={formatMoney(sum(due30))} hint={`${due30.length} purchase invoice${due30.length === 1 ? "" : "s"}`} />
      </div>
      <div className="space-y-6">
        <Card>
          <CardHeader title="Aging by vendor" description="Click a vendor to see their purchase invoices." />
          <AsOfToolbar asOf={asOf} exportHref={`/finance/aged-payables/export?asOf=${asOf}`}>
            <input type="hidden" name="due" value={due} />
          </AsOfToolbar>
          <AgingTable
            parties={aged.parties}
            totals={aged.totals}
            total={aged.total}
            partyLabel="Vendor"
            selected={party}
            partyHref={(p) => href({ party: p })}
            docHref={(id) => `/finance/purchase-invoices/${id}`}
          />
        </Card>

        <Card>
          <CardHeader
            title={`Due in the next ${due} days`}
            description={`Purchase invoices not yet overdue, due ${formatDmy(asOf)} to ${formatDmy(addDaysIso(asOf, due - 1))}.`}
            actions={
              <>
                <Link href={href({ due: 7 })} className={buttonClass(due === 7 ? "primary" : "secondary", "sm")} scroll={false}>
                  7 days
                </Link>
                <Link href={href({ due: 30 })} className={buttonClass(due === 30 ? "primary" : "secondary", "sm")} scroll={false}>
                  30 days
                </Link>
              </>
            }
          />
          <Table>
            <THead>
              <tr>
                <TH>Purchase invoice</TH>
                <TH>Vendor inv.</TH>
                <TH>Vendor</TH>
                <TH>Due</TH>
                <TH align="right">Balance</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {dueList.length === 0 && <EmptyRow colSpan={6}>Nothing falls due in this window.</EmptyRow>}
              {dueList.map((d) => (
                <TR key={d.id}>
                  <TD>
                    <Link href={`/finance/purchase-invoices/${d.id}`} className="font-medium text-brand-700 hover:underline">
                      {d.number}
                    </Link>
                  </TD>
                  <TD className="text-ink-soft">{d.supplierInvoiceNo ?? "—"}</TD>
                  <TD>{d.partyName}</TD>
                  <TD className="text-ink-soft">{formatDmy(d.dueDate || d.docDate)}</TD>
                  <TD align="right">{formatMoney(d.balance)}</TD>
                  <TD align="right">
                    <Link href={`/finance/vendor-payments/new?supplierId=${d.partyId}&billId=${d.id}`} className="text-xs text-brand-700 hover:underline">
                      Pay
                    </Link>
                  </TD>
                </TR>
              ))}
              {dueList.length > 0 && (
                <TR className="font-semibold">
                  <TD colSpan={4}>Total</TD>
                  <TD align="right">{formatMoney(sum(dueList))}</TD>
                  <TD />
                </TR>
              )}
            </TBody>
          </Table>
        </Card>

        <AdvancesCard
          title="Unapplied payments"
          description="Advances paid to vendors and not yet set against a purchase invoice."
          rows={advances}
          partyLabel="Vendor"
        />
      </div>
    </>
  );
}
