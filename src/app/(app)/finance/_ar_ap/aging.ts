/**
 * Aged receivables / payables maths. Pure and client-safe. Dates are
 * YYYY-MM-DD strings; a document with no due date is due on its own date.
 */

import { money } from "@/lib/finance/chart";
import { addDaysIso, daysBetween, todayIso } from "@/lib/ops/dates";

export const AGING_BUCKETS = [
  { key: "notDue", label: "Not due" },
  { key: "d1_30", label: "1–30 days" },
  { key: "d31_60", label: "31–60 days" },
  { key: "d61_90", label: "61–90 days" },
  { key: "d90plus", label: "Over 90 days" },
] as const;

export type BucketKey = (typeof AGING_BUCKETS)[number]["key"];
export type Buckets = Record<BucketKey, number>;

export type AgingDoc = {
  id: string;
  number: string;
  partyId: string;
  partyName: string;
  docDate: string;
  dueDate: string | null;
  total: number;
  /** Open balance as of the report date. */
  balance: number;
};

export type AgedDoc = AgingDoc & { daysOverdue: number; bucket: BucketKey };

export type AgedParty = { partyId: string; partyName: string; buckets: Buckets; total: number; docs: AgedDoc[] };

export const emptyBuckets = (): Buckets => ({ notDue: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 });

/** Days past due on `asOf` (0 or negative = not yet due). */
export function daysOverdue(asOf: string, dueDate: string | null, docDate: string): number {
  return daysBetween(dueDate || docDate, asOf) ?? 0;
}

export function bucketOf(days: number): BucketKey {
  if (days <= 0) return "notDue";
  if (days <= 30) return "d1_30";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "d90plus";
}

/** Balance on `asOf`: the total less payments dated on or before it. */
export function balanceAsOf(total: number, payments: Array<{ date: string; amount: number }>, asOf: string): number {
  return money(total - payments.filter((p) => p.date <= asOf).reduce((s, p) => s + p.amount, 0));
}

/**
 * Groups open documents by party and buckets them by days overdue. Parties
 * are sorted by name; each party's documents oldest first.
 */
export function ageDocuments(docs: AgingDoc[], asOf: string): { parties: AgedParty[]; totals: Buckets; total: number } {
  const parties = new Map<string, AgedParty>();
  const totals = emptyBuckets();
  for (const d of docs) {
    if (Math.abs(d.balance) < 0.005) continue;
    const days = daysOverdue(asOf, d.dueDate, d.docDate);
    const bucket = bucketOf(days);
    const party = parties.get(d.partyId) ?? { partyId: d.partyId, partyName: d.partyName, buckets: emptyBuckets(), total: 0, docs: [] };
    party.docs.push({ ...d, daysOverdue: days, bucket });
    party.buckets[bucket] = money(party.buckets[bucket] + d.balance);
    party.total = money(party.total + d.balance);
    totals[bucket] = money(totals[bucket] + d.balance);
    parties.set(d.partyId, party);
  }
  const list = [...parties.values()].sort((a, b) => a.partyName.localeCompare(b.partyName));
  for (const p of list) p.docs.sort((a, b) => (a.dueDate || a.docDate).localeCompare(b.dueDate || b.docDate) || a.number.localeCompare(b.number));
  return { parties: list, totals, total: money(Object.values(totals).reduce((s, v) => s + v, 0)) };
}

/** Documents not yet overdue that fall due in the `days` calendar days starting on asOf. */
export function dueWithin<T extends Pick<AgingDoc, "dueDate" | "docDate" | "balance">>(docs: T[], asOf: string, days: number): T[] {
  const until = addDaysIso(asOf, days - 1);
  return docs.filter((d) => {
    const due = d.dueDate || d.docDate;
    return d.balance > 0.004 && due >= asOf && due <= until;
  });
}

/** Documents already overdue on `asOf`. */
export function overdue<T extends Pick<AgingDoc, "dueDate" | "docDate" | "balance">>(docs: T[], asOf: string): T[] {
  return docs.filter((d) => d.balance > 0.004 && (d.dueDate || d.docDate) < asOf);
}

/** The Indian calendar day (YYYY-MM-DD) of a stored date or timestamp. */
export function istDay(d: Date | string | null | undefined): string {
  return d ? todayIso(new Date(d)) : "";
}
