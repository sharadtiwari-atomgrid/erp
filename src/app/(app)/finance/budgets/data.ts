import "server-only";
import { db } from "@/lib/db";
import { glEntryWhere } from "@/lib/finance/queries";
import { num } from "@/lib/format";
import { isoFromDay } from "@/lib/ops/dates";

export type MonthTotals = Map<string, Map<string, { debit: number; credit: number }>>;

/** Income and expense debit/credit per account per month ("YYYY-MM-01"), excluding the year-end close. */
export async function actualsByMonth(from: string, to: string, dimensions: Record<string, string>): Promise<MonthTotals> {
  const rows = await db.glEntry.groupBy({
    by: ["accountId", "postingDate"],
    where: { ...glEntryWhere({ from, to, dimensions, excludeClosing: true }), account: { type: { in: ["INCOME", "EXPENSE"] } } },
    _sum: { debit: true, credit: true },
  });
  const out: MonthTotals = new Map();
  for (const r of rows) {
    const month = `${isoFromDay(r.postingDate).slice(0, 7)}-01`;
    const byMonth = out.get(r.accountId) ?? new Map<string, { debit: number; credit: number }>();
    const cur = byMonth.get(month) ?? { debit: 0, credit: 0 };
    byMonth.set(month, { debit: cur.debit + num(r._sum.debit), credit: cur.credit + num(r._sum.credit) });
    out.set(r.accountId, byMonth);
  }
  return out;
}

/** Posting income and expense accounts for budget grids (plus any blocked ones already budgeted). */
export async function budgetAccounts(budgetId?: string) {
  return db.glAccount.findMany({
    where: {
      type: { in: ["INCOME", "EXPENSE"] },
      isGroup: false,
      OR: [{ isActive: true }, ...(budgetId ? [{ budgetLines: { some: { budgetId } } }] : [])],
    },
    orderBy: [{ type: "desc" }, { code: "asc" }],
    select: { id: true, code: true, name: true, type: true },
  });
}

export function budgetDims(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, v]) => typeof v === "string" && v)) as Record<string, string>;
}
