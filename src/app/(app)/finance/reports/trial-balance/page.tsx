import Link from "next/link";
import type { Metadata } from "next";
import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PrintButton } from "@/components/ui/print-button";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { drCr, type TrialBalanceColumns } from "@/lib/finance/reports";
import { formatDmy } from "@/lib/ops/dates";
import { amt } from "../_lib/amount";
import { loadTrialBalance } from "../_lib/build";
import { describeFilters, filterQuery, loadFilterOptions, pageReader, readFilters } from "../_lib/data";
import { ReportFilterBar } from "../_lib/filter-bar";

export const metadata: Metadata = { title: "Trial Balance" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

const num = "whitespace-nowrap px-3 py-2 text-right tabular-nums";

function TotalCells({ c }: { c: TrialBalanceColumns }) {
  return (
    <>
      <td className={num}>{amt(c.openingDr)}</td>
      <td className={num}>{amt(c.openingCr)}</td>
      <td className={num}>{amt(c.debit)}</td>
      <td className={num}>{amt(c.credit)}</td>
      <td className={num}>{amt(c.closingDr)}</td>
      <td className={num}>{amt(c.closingCr)}</td>
    </>
  );
}

export default async function TrialBalancePage({ searchParams }: PageProps<"/finance/reports/trial-balance">) {
  await requireUser("finance");
  await ensureFinanceSetup();
  const filters = await readFilters(pageReader(await searchParams));
  const [tb, options] = await Promise.all([loadTrialBalance(filters), loadFilterOptions()]);
  const drill = filterQuery(filters, {}, ["from", "to"]);
  const scope = describeFilters(filters, options);

  return (
    <>
      <PageHeader
        title="Trial Balance"
        description={`${formatDmy(filters.from)} to ${formatDmy(filters.to)}${scope ? ` · ${scope}` : ""}`}
        back={{ href: "/finance", label: "Finance" }}
        actions={
          <>
            <ButtonLink variant="secondary" href={`/finance/reports/trial-balance/export?${filterQuery(filters)}`} prefetch={false}>
              Export to Excel
            </ButtonLink>
            <PrintButton />
          </>
        }
      />
      <Card>
        <ReportFilterBar filters={filters} options={options} showZeroToggle />
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/60 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              <tr>
                <th rowSpan={2} className="px-3 py-2 text-left">Account</th>
                <th colSpan={2} className="border-l border-line px-3 py-2 text-center">Opening balance</th>
                <th colSpan={2} className="border-l border-line px-3 py-2 text-center">Period</th>
                <th colSpan={2} className="border-l border-line px-3 py-2 text-center">Closing balance</th>
              </tr>
              <tr>
                {["Dr", "Cr", "Debit", "Credit", "Dr", "Cr"].map((h, i) => (
                  <th key={i} className={cn("px-3 py-2 text-right", i % 2 === 0 && "border-l border-line")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tb.groups.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-ink-faint">
                    No ledger entries for these filters.
                  </td>
                </tr>
              )}
              {tb.groups.map((g) => (
                <Fragment key={g.heading?.id ?? "none"}>
                  <tr className="bg-muted/30">
                    <td colSpan={7} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink">
                      {g.heading ? `${g.heading.code} · ${g.heading.name}` : "Other accounts"}
                    </td>
                  </tr>
                  {g.rows.map((r) => {
                    const o = drCr(r.opening);
                    const c = drCr(r.closing);
                    return (
                      <tr key={r.id} className="hover:bg-muted/30">
                        <td className="px-3 py-2 pl-6">
                          <Link href={`/finance/accounts/${r.id}?${drill}`} className="text-ink hover:text-brand-700 hover:underline">
                            <span className="tabular-nums text-ink-soft">{r.code}</span> {r.name}
                          </Link>
                        </td>
                        <td className={num}>{amt(o.dr)}</td>
                        <td className={num}>{amt(o.cr)}</td>
                        <td className={num}>{amt(r.debit)}</td>
                        <td className={num}>{amt(r.credit)}</td>
                        <td className={num}>{amt(c.dr)}</td>
                        <td className={num}>{amt(c.cr)}</td>
                      </tr>
                    );
                  })}
                  <tr className="text-ink-soft">
                    <td className="px-3 py-2 pl-6 text-xs font-medium">Subtotal</td>
                    <TotalCells c={g.subtotal} />
                  </tr>
                </Fragment>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-line bg-muted/50 font-semibold text-ink">
              <tr>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-2">
                    Total
                    {tb.balanced ? <Badge tone="green">✓ Balanced</Badge> : <Badge tone="red">Out of balance</Badge>}
                  </span>
                </td>
                <TotalCells c={tb.totals} />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
      <p className="mt-3 text-xs text-ink-faint">
        Opening balances include every entry before {formatDmy(filters.from)}. Click an account to see its ledger entries for the period.
      </p>
    </>
  );
}
