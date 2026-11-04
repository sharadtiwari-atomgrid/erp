/**
 * TDS on vendor payments. Pure and client-safe.
 */

import { money } from "@/lib/finance/chart";

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** The deductee's PAN: the PAN field, else characters 3–12 of the GSTIN. */
export function panOf(contact: { pan?: string | null; gstin?: string | null }): string | null {
  const pan = contact.pan?.trim().toUpperCase();
  if (pan && PAN_RE.test(pan)) return pan;
  const fromGstin = contact.gstin?.trim().toUpperCase().slice(2, 12);
  if (fromGstin && PAN_RE.test(fromGstin)) return fromGstin;
  return null;
}

/** A company deductee: the 4th character of the PAN is "C". */
export function isCompanyDeductee(contact: { pan?: string | null; gstin?: string | null }): boolean {
  return panOf(contact)?.charAt(3) === "C";
}

/** Section rate (%) for this deductee: rateCompany for companies, rateIndividual for everyone else. */
export function tdsRateFor(section: { rateIndividual: number; rateCompany: number }, contact: { pan?: string | null; gstin?: string | null }): number {
  return isCompanyDeductee(contact) ? section.rateCompany : section.rateIndividual;
}

/** Taxable value (before GST) of the part of a bill being settled, pro rata. */
export function taxableShare(applied: number, bill: { subtotal: number; total: number }): number {
  if (bill.total <= 0) return 0;
  if (applied >= bill.total - 0.004) return money(bill.subtotal);
  return money((applied * bill.subtotal) / bill.total);
}

/** TDS on a base at a rate, rounded to the nearest rupee (section 288B). */
export function tdsAmount(base: number, ratePct: number): number {
  if (base <= 0 || ratePct <= 0) return 0;
  return Math.round((base * ratePct) / 100);
}

/** Base (taxable value of the applied bills) and TDS for a set of applications. */
export function computeTds(
  applications: Array<{ amount: number; bill: { subtotal: number; total: number } }>,
  ratePct: number,
): { base: number; tds: number } {
  const base = money(applications.reduce((s, a) => s + taxableShare(a.amount, a.bill), 0));
  return { base, tds: tdsAmount(base, ratePct) };
}
