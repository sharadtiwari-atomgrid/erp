import "server-only";
import { db } from "@/lib/db";
import { FinanceError } from "@/lib/finance/posting";
import { num } from "@/lib/format";
import { dayFromIso } from "@/lib/ops/dates";
import { reconciliationSummary } from "./matching";

/** A business-rule failure in cash management / fixed assets; shown to the user. */
export class CashFaError extends Error {}

/** Runs a write and turns expected business-rule failures into a form error. */
export async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    if (e instanceof FinanceError || e instanceof CashFaError) return { ok: false, error: e.message };
    throw e;
  }
}

/** GL balance (debit − credit) per account id, optionally up to a date. */
export async function glBalances(accountIds: string[], toIso?: string): Promise<Map<string, number>> {
  if (accountIds.length === 0) return new Map();
  const rows = await db.glEntry.groupBy({
    by: ["accountId"],
    where: { accountId: { in: accountIds }, ...(toIso ? { postingDate: { lte: dayFromIso(toIso) } } : {}) },
    _sum: { debit: true, credit: true },
  });
  return new Map(rows.map((r) => [r.accountId, num(r._sum.debit) - num(r._sum.credit)]));
}

/** Ledger entry ids already matched to a statement line of this bank (optionally only lines up to a date). */
export async function matchedEntryIds(bankAccountId: string, toIso?: string): Promise<Set<string>> {
  const lines = await db.bankStatementLine.findMany({
    where: { bankAccountId, status: "MATCHED", ...(toIso ? { date: { lte: dayFromIso(toIso) } } : {}) },
    select: { matchedEntryIds: true },
  });
  return new Set(lines.flatMap((l) => l.matchedEntryIds));
}

/**
 * Ledger entries on the bank's GL account that are not matched to a
 * statement line. Reversed entries (an original and its reversal) cancel out
 * and are left out.
 */
export async function unclearedEntries(bankAccountId: string, glAccountId: string, opts: { toIso?: string; matchedToIso?: string } = {}) {
  const matched = await matchedEntryIds(bankAccountId, opts.matchedToIso);
  const entries = await db.glEntry.findMany({
    where: { accountId: glAccountId, reversed: false, ...(opts.toIso ? { postingDate: { lte: dayFromIso(opts.toIso) } } : {}) },
    orderBy: [{ postingDate: "asc" }, { entryNo: "asc" }],
    select: { id: true, entryNo: true, transactionNo: true, postingDate: true, debit: true, credit: true, documentType: true, documentNo: true, description: true, contact: { select: { name: true } } },
  });
  return entries.filter((e) => !matched.has(e.id));
}

/** Import batch label for synthetic "cleared as opening" statement lines (hidden from statement views). */
export const OPENING_BATCH = "OPENING-CLEAR";

/** Works out the reconciliation figures as at a statement date. */
export async function reconciliationFigures(bankAccountId: string, glAccountId: string, statementDate: string, statementBalance: number) {
  const [balances, uncleared, unmatchedLines] = await Promise.all([
    glBalances([glAccountId], statementDate),
    unclearedEntries(bankAccountId, glAccountId, { toIso: statementDate, matchedToIso: statementDate }),
    db.bankStatementLine.count({ where: { bankAccountId, status: "UNMATCHED", date: { lte: dayFromIso(statementDate) } } }),
  ]);
  const summary = reconciliationSummary({
    bookBalance: balances.get(glAccountId) ?? 0,
    uncleared: uncleared.map((e) => ({ debit: num(e.debit), credit: num(e.credit) })),
    statementBalance,
  });
  return { summary, uncleared, unmatchedLines };
}
