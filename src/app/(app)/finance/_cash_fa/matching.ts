/**
 * Bank reconciliation matching and summary (pure, client-safe).
 *
 * A statement line's amount is from the bank's point of view (positive =
 * deposit). A ledger entry on the bank's GL account moves the book balance by
 * debit − credit, so a deposit matches a debit and a withdrawal a credit.
 */

import { money } from "@/lib/finance/chart";

export type MatchLine = { id: string; date: string; amount: number; reference: string | null; description: string };
export type MatchEntry = { id: string; date: string; debit: number; credit: number; documentNo: string | null; description: string | null };

export const entryAmount = (e: Pick<MatchEntry, "debit" | "credit">) => money(e.debit - e.credit);

const DAY = 86_400_000;
const dayGap = (a: string, b: string) => Math.abs(Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY));

const tokens = (s: string | null | undefined) =>
  new Set(
    String(s ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !/^(neft|rtgs|imps|upi|chq|ref|the|and|for|payment|transfer|to|by|from)$/.test(t)),
  );
const compact = (s: string | null | undefined) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * How alike the line's reference / narration is to the entry's document no. /
 * description, 0–1. 1 when one contains the other's reference outright.
 */
export function referenceSimilarity(line: Pick<MatchLine, "reference" | "description">, entry: Pick<MatchEntry, "documentNo" | "description">): number {
  const lineText = compact(`${line.reference ?? ""} ${line.description}`);
  for (const ref of [entry.documentNo, entry.description]) {
    const c = compact(ref);
    if (c.length >= 4 && lineText.includes(c)) return 1;
  }
  const lineRef = compact(line.reference);
  if (lineRef.length >= 4 && compact(`${entry.documentNo ?? ""} ${entry.description ?? ""}`).includes(lineRef)) return 1;
  const a = tokens(`${line.reference ?? ""} ${line.description}`);
  const b = tokens(`${entry.documentNo ?? ""} ${entry.description ?? ""}`);
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const t of a) if (b.has(t)) common++;
  return common / Math.min(a.size, b.size);
}

export type AutoMatch = { lineId: string; entryId: string; score: number };

/**
 * Proposes one-to-one matches: exact amount (deposit ↔ debit, withdrawal ↔
 * credit) and dates within ±`dayWindow` days. Candidates are ranked by
 * reference similarity, then by how close the dates are; each line and entry
 * is used at most once.
 */
export function autoMatch(lines: MatchLine[], entries: MatchEntry[], dayWindow = 3): AutoMatch[] {
  const candidates: AutoMatch[] = [];
  for (const l of lines) {
    for (const e of entries) {
      if (entryAmount(e) !== money(l.amount)) continue;
      const gap = dayGap(l.date, e.date);
      if (gap > dayWindow) continue;
      const score = referenceSimilarity(l, e) * 10 + (dayWindow - gap);
      candidates.push({ lineId: l.id, entryId: e.id, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.lineId.localeCompare(b.lineId) || a.entryId.localeCompare(b.entryId));
  const usedLines = new Set<string>();
  const usedEntries = new Set<string>();
  const out: AutoMatch[] = [];
  for (const c of candidates) {
    if (usedLines.has(c.lineId) || usedEntries.has(c.entryId)) continue;
    usedLines.add(c.lineId);
    usedEntries.add(c.entryId);
    out.push(c);
  }
  return out;
}

/** Error message when the chosen entries cannot be matched to the line, else null. */
export function manualMatchProblem(line: Pick<MatchLine, "amount">, entries: Array<Pick<MatchEntry, "debit" | "credit">>): string | null {
  if (entries.length === 0) return "Choose at least one ledger entry.";
  const total = money(entries.reduce((s, e) => s + entryAmount(e), 0));
  if (total !== money(line.amount)) {
    return `The entries total ${total.toFixed(2)} but the statement line is ${money(line.amount).toFixed(2)}.`;
  }
  return null;
}

export type ReconciliationSummary = {
  bookBalance: number;
  /** Debits in the books not yet on the statement (deposits in transit). */
  unclearedDeposits: number;
  /** Credits in the books not yet on the statement (cheques issued, not presented). */
  unclearedPayments: number;
  /** Book balance − uncleared deposits + uncleared payments: what the bank should show. */
  expectedStatementBalance: number;
  statementBalance: number;
  difference: number;
};

/** Book balance adjusted for uncleared ledger entries, compared with the statement closing balance. */
export function reconciliationSummary(input: {
  bookBalance: number;
  uncleared: Array<Pick<MatchEntry, "debit" | "credit">>;
  statementBalance: number;
}): ReconciliationSummary {
  const unclearedDeposits = money(input.uncleared.reduce((s, e) => s + e.debit, 0));
  const unclearedPayments = money(input.uncleared.reduce((s, e) => s + e.credit, 0));
  const expected = money(input.bookBalance - unclearedDeposits + unclearedPayments);
  return {
    bookBalance: money(input.bookBalance),
    unclearedDeposits,
    unclearedPayments,
    expectedStatementBalance: expected,
    statementBalance: money(input.statementBalance),
    difference: money(input.statementBalance - expected),
  };
}
