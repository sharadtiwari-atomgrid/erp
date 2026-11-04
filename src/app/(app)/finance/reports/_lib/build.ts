import "server-only";
import { fiscalYearOf, periodsOf } from "@/lib/finance/chart";
import { buildBalanceSheet, buildCashFlow, buildProfitAndLoss, buildTrialBalance, previousYearRange } from "@/lib/finance/reports";
import { addDaysIso, formatDmy } from "@/lib/ops/dates";
import { loadReportAccounts, totalsBefore, totalsBetween, totalsUpTo, type ReportFilters } from "./data";

/** Loads ledger totals and builds each statement; shared by the pages and their Excel exports. */

export async function loadTrialBalance(f: ReportFilters) {
  const [accounts, opening, period] = await Promise.all([loadReportAccounts(), totalsBefore(f, f.from), totalsBetween(f, f.from, f.to)]);
  return buildTrialBalance(accounts, opening, period, { hideZero: f.hideZero });
}

export async function loadProfitAndLoss(f: ReportFilters) {
  const accounts = await loadReportAccounts();
  if (f.view === "monthly") {
    const fy = fiscalYearOf(f.from);
    const months = periodsOf(fy.startYear);
    const totals = await Promise.all([...months.map((m) => totalsBetween(f, m.start, m.end, true)), totalsBetween(f, fy.start, fy.end, true)]);
    return {
      columns: [...months.map((m) => m.name), fy.name],
      drill: { from: fy.start, to: fy.end },
      pnl: buildProfitAndLoss(accounts, totals),
      subtitle: `${fy.name}, month by month`,
    };
  }
  const prev = previousYearRange(f.from, f.to);
  const [current, previous] = await Promise.all([totalsBetween(f, f.from, f.to, true), totalsBetween(f, prev.from, prev.to, true)]);
  return {
    columns: [`${formatDmy(f.from)} – ${formatDmy(f.to)}`, `${formatDmy(prev.from)} – ${formatDmy(prev.to)}`],
    drill: { from: f.from, to: f.to },
    pnl: buildProfitAndLoss(accounts, [current, previous]),
    subtitle: `${formatDmy(f.from)} to ${formatDmy(f.to)}, with the same period last year`,
  };
}

/** Balance sheet as on the date, with the previous financial year end as comparative. */
export async function loadBalanceSheet(f: ReportFilters) {
  const prevEnd = addDaysIso(fiscalYearOf(f.asOn).start, -1);
  const [accounts, current, previous] = await Promise.all([loadReportAccounts(), totalsUpTo(f, f.asOn), totalsUpTo(f, prevEnd)]);
  return {
    columns: [`As on ${formatDmy(f.asOn)}`, `As on ${formatDmy(prevEnd)}`],
    prevEnd,
    bs: buildBalanceSheet(accounts, [current, previous]),
  };
}

export async function loadCashFlow(f: ReportFilters) {
  const [accounts, opening, period] = await Promise.all([loadReportAccounts(), totalsBefore(f, f.from), totalsBetween(f, f.from, f.to, true)]);
  return buildCashFlow(accounts, opening, period);
}
