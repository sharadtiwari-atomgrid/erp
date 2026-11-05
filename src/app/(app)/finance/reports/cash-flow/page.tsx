import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PrintButton } from "@/components/ui/print-button";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import type { CashFlowLine } from "@/lib/finance/reports";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { formatDmy } from "@/lib/ops/dates";
import { amt, amtClass } from "../_lib/amount";
import { loadCashFlow } from "../_lib/build";
import { describeFilters, filterQuery, loadFilterOptions, pageReader, readFilters } from "../_lib/data";
import { ReportFilterBar } from "../_lib/filter-bar";

export const metadata: Metadata = { title: "Statement of Cash Flows" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

function Row({ label, amount, strong, indent, muted }: { label: ReactNode; amount?: number; strong?: boolean; indent?: boolean; muted?: boolean }) {
  return (
    <tr className={cn(strong ? "bg-muted/40 font-semibold" : "hover:bg-muted/30", muted && "text-ink-soft")}>
      <td className={cn("px-4 py-2", indent && "pl-10")}>{label}</td>
      <td className={cn("whitespace-nowrap px-4 py-2 text-right tabular-nums", amount !== undefined && amtClass(amount))}>
        {amount === undefined ? "" : amt(amount, { zero: "0.00" })}
      </td>
    </tr>
  );
}

function Section({ title, lines, total, totalLabel }: { title: string; lines: CashFlowLine[]; total: number; totalLabel: string }) {
  return (
    <>
      <tr className="bg-muted/30">
        <td colSpan={2} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink">
          {title}
        </td>
      </tr>
      {lines.length === 0 && <Row label="No movements" indent muted />}
      {lines.map((l) =>
        l.kind === "heading" ? <Row key={l.key} label={<span className="text-xs font-medium uppercase text-ink-soft">{l.label}</span>} indent /> : <Row key={l.key} label={l.label} amount={l.amount} indent />,
      )}
      <Row label={totalLabel} amount={total} strong />
    </>
  );
}

export default async function CashFlowPage({ searchParams }: PageProps<"/finance/reports/cash-flow">) {
  await requireUser("finance");
  await ensureFinanceSetup();
  const filters = await readFilters(pageReader(await searchParams));
  const [cf, options] = await Promise.all([loadCashFlow(filters), loadFilterOptions()]);
  const scope = describeFilters(filters, options);
  const reconciles = Math.abs(cf.difference) < 0.005;

  return (
    <>
      <PageHeader
        title="Statement of Cash Flows"
        description={`Indirect method · ${formatDmy(filters.from)} to ${formatDmy(filters.to)}${scope ? ` · ${scope}` : ""}`}
        back={{ href: "/finance", label: "Finance" }}
        actions={
          <>
            <ButtonLink variant="secondary" href={`/finance/reports/cash-flow/export?${filterQuery(filters)}`} prefetch={false}>
              Export to Excel
            </ButtonLink>
            <PrintButton />
          </>
        }
      />
      <Card>
        <ReportFilterBar filters={filters} options={options} />
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-line text-sm">
            <thead className="bg-muted/60 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-4 py-2.5 text-left">Particulars</th>
                <th className="px-4 py-2.5 text-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <Section title="A. Cash flow from operating activities" lines={cf.operating} total={cf.netOperating} totalLabel="Net cash from operating activities (A)" />
              <Section title="B. Cash flow from investing activities" lines={cf.investing} total={cf.netInvesting} totalLabel="Net cash from investing activities (B)" />
              <Section title="C. Cash flow from financing activities" lines={cf.financing} total={cf.netFinancing} totalLabel="Net cash from financing activities (C)" />
              <Row label="Net increase / (decrease) in cash and cash equivalents (A + B + C)" amount={cf.netChange} strong />
              <Row label="Cash and cash equivalents at the beginning of the period" amount={cf.openingCash} />
              <Row label="Cash and cash equivalents at the end of the period" amount={cf.closingCash} strong />
              <tr className="bg-muted/30">
                <td colSpan={2} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink">
                  Reconciliation
                </td>
              </tr>
              <Row label="Movement in cash & bank accounts per the ledger" amount={cf.cashMovement} indent />
              <Row label="Net change per this statement" amount={cf.netChange} indent />
              <Row
                label={
                  <span className="inline-flex items-center gap-2">
                    Difference {reconciles ? <Badge tone="green">✓ Reconciled</Badge> : <Badge tone="red">Does not reconcile</Badge>}
                  </span>
                }
                amount={cf.difference}
                strong
              />
            </tbody>
          </table>
        </div>
      </Card>
      <p className="mt-3 text-xs text-ink-faint">
        Accounts are classified by their cash flow group in the chart of accounts. Cash &amp; cash equivalents are the accounts in the CASH
        group. The year-end closing entry is excluded.
      </p>
    </>
  );
}
