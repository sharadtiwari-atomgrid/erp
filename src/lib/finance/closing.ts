import type { GlAccountType } from "@/generated/prisma/enums";
import type { Tx } from "@/lib/db";
import { dayFromIso, isoFromDay } from "@/lib/ops/dates";
import { money, normalBalance } from "./chart";

/**
 * Year-end close. The pure part (closingLines) is unit-tested; the database
 * part loads posting.ts lazily so this module can be imported by tests
 * without the server-only guard.
 */

export const YEAR_END_CLOSE = "Year-end close";

export type ClosingBalance = { accountId: string; type: GlAccountType; debit: number; credit: number };

export type ClosingLine = { account: { id: string } | "RETAINED_EARNINGS"; debit: number; credit: number; description: string };

/**
 * Lines that bring every income and expense balance to zero, with the net
 * profit credited (or loss debited) to retained earnings. Accounts already
 * at zero are skipped. Returns no lines when there is nothing to close.
 */
export function closingLines(balances: ClosingBalance[]): { lines: ClosingLine[]; profit: number } {
  const lines: ClosingLine[] = [];
  let profit = 0;
  for (const b of balances) {
    if (b.type !== "INCOME" && b.type !== "EXPENSE") continue;
    const net = money(b.debit - b.credit); // debit balance > 0
    if (net === 0) continue;
    lines.push({
      account: { id: b.accountId },
      debit: net < 0 ? -net : 0,
      credit: net > 0 ? net : 0,
      description: "Closing balance transferred to retained earnings",
    });
    profit += b.type === "INCOME" ? normalBalance("INCOME", b.debit, b.credit) : -normalBalance("EXPENSE", b.debit, b.credit);
  }
  profit = money(profit);
  if (lines.length === 0) return { lines, profit: 0 };
  if (profit !== 0) {
    lines.push({
      account: "RETAINED_EARNINGS",
      debit: profit < 0 ? -profit : 0,
      credit: profit > 0 ? profit : 0,
      description: profit > 0 ? "Net profit for the year" : "Net loss for the year",
    });
  }
  return { lines, profit };
}

async function financeError(message: string): Promise<Error> {
  const { FinanceError } = await import("./posting");
  return new FinanceError(message);
}

/** The last period of the year must be open for the system to post on its last day. */
async function withLastPeriodOpen<T>(tx: Tx, fiscalYearId: string, endDate: Date, fn: () => Promise<T>): Promise<T> {
  const last = await tx.accountingPeriod.findFirst({ where: { fiscalYearId, endDate } });
  if (!last) throw await financeError("The year has no closing period.");
  await tx.accountingPeriod.update({ where: { id: last.id }, data: { closed: false } });
  const result = await fn();
  await tx.accountingPeriod.update({ where: { id: last.id }, data: { closed: last.closed, closedAt: last.closedAt } });
  return result;
}

/**
 * Posts ONE "Year-end close" transaction dated the last day of the year that
 * zeroes income and expenses into RETAINED_EARNINGS, then marks the year
 * closed. Every period must already be closed. Call inside db.$transaction.
 */
export async function closeFiscalYear(tx: Tx, fiscalYearId: string, userId?: string | null) {
  const { postTransaction } = await import("./posting");
  const fy = await tx.fiscalYear.findUnique({ where: { id: fiscalYearId }, include: { periods: true } });
  if (!fy) throw await financeError("This financial year no longer exists.");
  if (fy.closed) throw await financeError(`${fy.name} is already closed.`);
  const open = fy.periods.filter((p) => !p.closed);
  if (fy.periods.length < 12 || open.length > 0) {
    throw await financeError(`Close every period of ${fy.name} first (${open.length} still open).`);
  }

  const rows = await tx.glEntry.groupBy({
    by: ["accountId"],
    where: { postingDate: { gte: fy.startDate, lte: fy.endDate }, account: { type: { in: ["INCOME", "EXPENSE"] } } },
    _sum: { debit: true, credit: true },
  });
  const accounts = await tx.glAccount.findMany({ where: { id: { in: rows.map((r) => r.accountId) } }, select: { id: true, type: true } });
  const typeOf = new Map(accounts.map((a) => [a.id, a.type]));
  const { lines, profit } = closingLines(
    rows.map((r) => ({ accountId: r.accountId, type: typeOf.get(r.accountId)!, debit: Number(r._sum.debit ?? 0), credit: Number(r._sum.credit ?? 0) })),
  );

  let transactionNo: number | null = null;
  if (lines.length > 0) {
    transactionNo = await withLastPeriodOpen(tx, fy.id, fy.endDate, () =>
      postTransaction(tx, {
        date: isoFromDay(fy.endDate),
        documentType: YEAR_END_CLOSE,
        documentNo: fy.name,
        sourceType: "FiscalYear",
        sourceId: fy.id,
        description: `Year-end close ${fy.name}`,
        userId,
        lines,
      }),
    );
  }
  await tx.fiscalYear.update({ where: { id: fy.id }, data: { closed: true, closedAt: new Date() } });
  return { transactionNo, profit };
}

/** Reverses the year's closing transaction (if any) and reopens the year. Periods stay closed. */
export async function reopenFiscalYear(tx: Tx, fiscalYearId: string, userId?: string | null) {
  const { findPostedTransaction, reverseTransaction } = await import("./posting");
  const fy = await tx.fiscalYear.findUnique({ where: { id: fiscalYearId } });
  if (!fy) throw await financeError("This financial year no longer exists.");
  if (!fy.closed) throw await financeError(`${fy.name} is not closed.`);
  const later = await tx.fiscalYear.findFirst({ where: { startDate: { gt: fy.startDate }, closed: true } });
  if (later) throw await financeError(`Reopen ${later.name} first.`);

  await tx.fiscalYear.update({ where: { id: fy.id }, data: { closed: false, closedAt: null } });
  const txNo = await findPostedTransaction(tx, "FiscalYear", fy.id);
  let reversalTxNo: number | null = null;
  if (txNo) {
    reversalTxNo = await withLastPeriodOpen(tx, fy.id, fy.endDate, () =>
      reverseTransaction(tx, txNo, { date: isoFromDay(fy.endDate), userId, reason: `Reopen ${fy.name}` }),
    );
  }
  return { reversalTxNo };
}

/** The first day of the financial year after `endDate`. */
export const nextYearStart = (endDate: Date) => isoFromDay(new Date(dayFromIso(isoFromDay(endDate)).getTime() + 86_400_000));
