import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { PrintButton } from "@/components/ui/print-button";
import { requireUser } from "@/lib/auth";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { loadProfitAndLoss } from "../_lib/build";
import { describeFilters, filterQuery, loadFilterOptions, pageReader, readFilters } from "../_lib/data";
import { ReportFilterBar } from "../_lib/filter-bar";
import { StatementTable } from "../_lib/statement-table";

export const metadata: Metadata = { title: "Profit & loss" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function ProfitAndLossPage({ searchParams }: PageProps<"/finance/reports/profit-and-loss">) {
  await requireUser("finance");
  await ensureFinanceSetup();
  const filters = await readFilters(pageReader(await searchParams));
  const [report, options] = await Promise.all([loadProfitAndLoss(filters), loadFilterOptions()]);
  const scope = describeFilters(filters, options);

  return (
    <>
      <PageHeader
        title="Statement of profit and loss"
        description={`Schedule III (Division II) · ${report.subtitle}${scope ? ` · ${scope}` : ""}`}
        back={{ href: "/finance", label: "Finance" }}
        actions={
          <>
            <ButtonLink variant="secondary" href={`/finance/reports/profit-and-loss/export?${filterQuery(filters)}`} prefetch={false}>
              Export to Excel
            </ButtonLink>
            <PrintButton />
          </>
        }
      />
      <Card>
        <ReportFilterBar filters={filters} options={options}>
          <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
            Columns
            <Select name="view" defaultValue={filters.view} className="w-52">
              <option value="compare">Period vs same period last year</option>
              <option value="monthly">Monthly across the financial year</option>
            </Select>
          </label>
        </ReportFilterBar>
        <StatementTable
          lines={report.pnl.lines}
          columns={report.columns}
          drillQuery={new URLSearchParams({ from: report.drill.from, to: report.drill.to }).toString()}
        />
      </Card>
      <p className="mt-3 text-xs text-ink-faint">
        Built from posted ledger entries by account category; the year-end closing entry is excluded. Use the Division filter for a
        divisional P&amp;L. Amounts in ₹; brackets are negative.
      </p>
    </>
  );
}
