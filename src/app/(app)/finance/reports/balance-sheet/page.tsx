import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PrintButton } from "@/components/ui/print-button";
import { requireUser } from "@/lib/auth";
import { fiscalYearOf } from "@/lib/finance/chart";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { formatDmy } from "@/lib/ops/dates";
import { amt } from "../_lib/amount";
import { loadBalanceSheet } from "../_lib/build";
import { describeFilters, filterQuery, loadFilterOptions, pageReader, readFilters } from "../_lib/data";
import { ReportFilterBar } from "../_lib/filter-bar";
import { StatementTable } from "../_lib/statement-table";

export const metadata: Metadata = { title: "Balance sheet" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function BalanceSheetPage({ searchParams }: PageProps<"/finance/reports/balance-sheet">) {
  await requireUser("finance");
  await ensureFinanceSetup();
  const filters = await readFilters(pageReader(await searchParams));
  const [report, options] = await Promise.all([loadBalanceSheet(filters), loadFilterOptions()]);
  const { bs } = report;
  const agrees = bs.difference.every((d) => Math.abs(d) < 0.005);
  const scope = describeFilters(filters, options);

  return (
    <>
      <PageHeader
        title="Balance sheet"
        description={`Schedule III · as on ${formatDmy(filters.asOn)}${scope ? ` · ${scope}` : ""}`}
        back={{ href: "/finance", label: "Finance" }}
        actions={
          <>
            <ButtonLink variant="secondary" href={`/finance/reports/balance-sheet/export?${filterQuery(filters)}`} prefetch={false}>
              Export to Excel
            </ButtonLink>
            <PrintButton />
          </>
        }
      />
      <Card>
        <ReportFilterBar filters={filters} options={options} mode="asOn" />
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5 text-sm">
          {agrees ? (
            <Badge tone="green">✓ Total assets agree with equity and liabilities</Badge>
          ) : (
            <Badge tone="red">Out of balance</Badge>
          )}
          {bs.difference.map((d, i) =>
            Math.abs(d) >= 0.005 ? (
              <span key={i} className="text-red-600">
                {report.columns[i]}: difference {amt(d)}
              </span>
            ) : null,
          )}
        </div>
        <StatementTable
          lines={bs.lines}
          columns={report.columns}
          drillQuery={new URLSearchParams({ from: fiscalYearOf(filters.asOn).start, to: filters.asOn }).toString()}
        />
      </Card>
      <p className="mt-3 text-xs text-ink-faint">
        Reserves &amp; surplus include the profit not yet closed to retained earnings
        {bs.currentProfit[0] ? ` (${amt(bs.currentProfit[0])} as on ${formatDmy(filters.asOn)})` : ""}. Property, plant &amp; equipment is
        shown net of accumulated depreciation. Comparative figures are as on the previous financial year end ({formatDmy(report.prevEnd)}).
      </p>
    </>
  );
}
