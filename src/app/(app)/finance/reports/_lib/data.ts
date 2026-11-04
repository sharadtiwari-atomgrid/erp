import "server-only";
import { db } from "@/lib/db";
import { getBranchScope } from "@/lib/branch";
import { fiscalYearOf } from "@/lib/finance/chart";
import { accountTotals, type BalanceFilter } from "@/lib/finance/queries";
import type { ReportAccount } from "@/lib/finance/reports";
import { addDaysIso, parseDay, todayIso } from "@/lib/ops/dates";

/** Reads one query value from page searchParams or a route handler's URLSearchParams. */
export type ParamReader = (key: string) => string;

export function pageReader(sp: Record<string, string | string[] | undefined>): ParamReader {
  return (key) => {
    const v = sp[key];
    return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
  };
}

export function urlReader(sp: URLSearchParams): ParamReader {
  return (key) => (sp.get(key) ?? "").trim();
}

export const DIMENSION_PARAM = "dim_";

export type ReportFilters = {
  from: string;
  to: string;
  /** Balance sheet date. */
  asOn: string;
  branchId: string | null;
  dimensions: Record<string, string>;
  hideZero: boolean;
  /** P&L: "compare" (same period last year) or "monthly". */
  view: "compare" | "monthly";
};

/**
 * Report filters from the query string. Dates default to the current
 * financial year to date; the branch defaults to the header's branch scope
 * (and is fixed for branch-restricted users).
 */
export async function readFilters(read: ParamReader): Promise<ReportFilters> {
  const today = todayIso();
  const fy = fiscalYearOf(today);
  const from = parseDay(read("from")) || fy.start;
  let to = parseDay(read("to")) || today;
  if (to < from) to = from;
  const asOn = parseDay(read("asOn")) || today;
  const scope = await getBranchScope();
  const branchId = scope.locked ? scope.branchId : read("branch") || scope.branchId;
  const dimensions: Record<string, string> = {};
  for (const code of ["DIVISION", "DEPARTMENT", "PROJECT", "BRANCH"]) {
    const v = read(`${DIMENSION_PARAM}${code}`);
    if (v) dimensions[code] = v;
  }
  return {
    from,
    to,
    asOn,
    branchId: branchId || null,
    dimensions,
    hideZero: read("hideZero") !== "0",
    view: read("view") === "monthly" ? "monthly" : "compare",
  };
}

/** Query string for links (exports, drill-downs) carrying the same filters. */
export function filterQuery(f: ReportFilters, extra: Record<string, string> = {}, keys: Array<keyof ReportFilters> = ["from", "to", "branchId", "dimensions", "hideZero", "view", "asOn"]): string {
  const q = new URLSearchParams();
  if (keys.includes("from")) q.set("from", f.from);
  if (keys.includes("to")) q.set("to", f.to);
  if (keys.includes("asOn")) q.set("asOn", f.asOn);
  if (keys.includes("branchId") && f.branchId) q.set("branch", f.branchId);
  if (keys.includes("dimensions")) for (const [k, v] of Object.entries(f.dimensions)) q.set(`${DIMENSION_PARAM}${k}`, v);
  if (keys.includes("hideZero") && !f.hideZero) q.set("hideZero", "0");
  if (keys.includes("view") && f.view !== "compare") q.set("view", f.view);
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  return q.toString();
}

export function balanceFilter(f: ReportFilters, range: { from?: string; to?: string }, excludeClosing = false): BalanceFilter {
  return { ...range, branchId: f.branchId, dimensions: f.dimensions, excludeClosing };
}

export async function loadReportAccounts(): Promise<ReportAccount[]> {
  return db.glAccount.findMany({
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, type: true, category: true, isGroup: true, parentId: true, cashFlowGroup: true },
  });
}

/** Totals of every entry before a date. */
export function totalsBefore(f: ReportFilters, iso: string, excludeClosing = false) {
  return accountTotals(balanceFilter(f, { to: addDaysIso(iso, -1) }, excludeClosing));
}

export function totalsBetween(f: ReportFilters, from: string, to: string, excludeClosing = false) {
  return accountTotals(balanceFilter(f, { from, to }, excludeClosing));
}

export function totalsUpTo(f: ReportFilters, iso: string) {
  return accountTotals(balanceFilter(f, { to: iso }));
}

export type FilterOptions = {
  branches: Array<{ id: string; name: string }>;
  branchLocked: boolean;
  dimensions: Array<{ code: string; name: string; values: Array<{ code: string; name: string }> }>;
};

export async function loadFilterOptions(): Promise<FilterOptions> {
  const [branches, dimensions, scope] = await Promise.all([
    db.branch.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.dimension.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { code: true, name: true, values: { where: { isActive: true }, orderBy: { code: "asc" }, select: { code: true, name: true } } },
    }),
    getBranchScope(),
  ]);
  return { branches, branchLocked: scope.locked, dimensions: dimensions.filter((d) => d.values.length > 0) };
}

/** Human description of the active filters, for headers and exports. */
export function describeFilters(f: ReportFilters, options: FilterOptions): string {
  const parts: string[] = [];
  if (f.branchId) parts.push(`Branch: ${options.branches.find((b) => b.id === f.branchId)?.name ?? "selected"}`);
  for (const [k, v] of Object.entries(f.dimensions)) parts.push(`${k}: ${v}`);
  return parts.join(" · ");
}
