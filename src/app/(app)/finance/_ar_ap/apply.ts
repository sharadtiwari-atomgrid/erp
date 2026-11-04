/**
 * Applying a receipt or payment to open documents (Business Central's "Apply
 * entries"). Pure and client-safe: used by the forms and re-checked by the
 * server actions.
 */

import { money } from "@/lib/finance/chart";

export type OpenDoc = {
  id: string;
  number: string;
  /** Document date, YYYY-MM-DD. */
  docDate: string;
  /** Due date, YYYY-MM-DD (blank = due on the document date). */
  dueDate: string | null;
  /** Unpaid balance. */
  balance: number;
};

export type Application = { docId: string; amount: number };

const EPS = 0.004;

/** Oldest first: by due date (or document date), then document date, then number. */
export function sortOldestFirst<T extends Pick<OpenDoc, "docDate" | "dueDate" | "number">>(docs: T[]): T[] {
  return [...docs].sort(
    (a, b) =>
      (a.dueDate || a.docDate).localeCompare(b.dueDate || b.docDate) ||
      a.docDate.localeCompare(b.docDate) ||
      a.number.localeCompare(b.number),
  );
}

/** Spreads `available` over the documents, oldest first, never more than each balance. */
export function autoApply(docs: OpenDoc[], available: number): Record<string, number> {
  const out: Record<string, number> = {};
  let left = money(Math.max(0, available));
  for (const d of sortOldestFirst(docs)) {
    if (left <= EPS) break;
    const amount = money(Math.min(left, d.balance));
    if (amount > EPS) {
      out[d.id] = amount;
      left = money(left - amount);
    }
  }
  return out;
}

/** Rounds, drops zero lines and merges duplicates. */
export function cleanApplications(apps: Application[]): Application[] {
  const byDoc = new Map<string, number>();
  for (const a of apps) {
    const amount = money(Number(a.amount) || 0);
    if (Math.abs(amount) <= EPS) continue;
    byDoc.set(a.docId, money((byDoc.get(a.docId) ?? 0) + amount));
  }
  return [...byDoc.entries()].map(([docId, amount]) => ({ docId, amount }));
}

export const totalApplied = (apps: Application[]) => money(apps.reduce((s, a) => s + a.amount, 0));

/**
 * Checks every application is positive and within the document's open
 * balance. Returns an error message, or null when valid.
 */
export function checkApplications(apps: Application[], docs: Array<Pick<OpenDoc, "id" | "number" | "balance">>): string | null {
  const byId = new Map(docs.map((d) => [d.id, d]));
  for (const a of apps) {
    if (a.amount < 0) return "Applied amounts cannot be negative.";
    const doc = byId.get(a.docId);
    if (!doc) return "One of the documents is no longer open. Reload and apply again.";
    if (a.amount > doc.balance + EPS) return `${doc.number}: applied amount is more than its open balance of ${doc.balance.toFixed(2)}.`;
  }
  return null;
}

/**
 * Cash receipt split. Each application settles an invoice by cash plus the
 * customer's TDS share, so the invoices together take up to amount + TDS.
 * Whatever cash is not applied stays as a customer advance.
 */
export function receiptSplit(input: { amount: number; tds: number; applied: number }):
  | { ok: true; cashApplied: number; unapplied: number }
  | { ok: false; error: string } {
  const amount = money(input.amount);
  const tds = money(input.tds);
  const applied = money(input.applied);
  if (amount <= 0) return { ok: false, error: "Amount received must be more than zero." };
  if (tds < 0) return { ok: false, error: "TDS cannot be negative." };
  if (tds > 0 && applied + EPS < tds) return { ok: false, error: "TDS deducted must be applied to the invoices it was deducted from: apply at least the TDS amount." };
  if (applied > amount + tds + EPS) return { ok: false, error: `Applied ${applied.toFixed(2)} is more than the amount received plus TDS (${money(amount + tds).toFixed(2)}).` };
  const cashApplied = money(applied - tds);
  return { ok: true, cashApplied, unapplied: money(amount - cashApplied) };
}

/**
 * Vendor payment split. Applications settle bills by cash plus TDS withheld;
 * an advance is paid on top. Cash leaving the bank = applied − TDS + advance.
 */
export function vendorPaymentSplit(input: { applied: number; tds: number; advance: number }):
  | { ok: true; cash: number }
  | { ok: false; error: string } {
  const applied = money(input.applied);
  const tds = money(input.tds);
  const advance = money(input.advance);
  if (tds < 0 || advance < 0) return { ok: false, error: "TDS and advance cannot be negative." };
  if (tds > applied + EPS) return { ok: false, error: "TDS cannot be more than the amount applied to bills." };
  const cash = money(applied - tds + advance);
  if (cash <= 0) return { ok: false, error: "Nothing to pay: apply the payment to bills or enter an advance." };
  return { ok: true, cash };
}
