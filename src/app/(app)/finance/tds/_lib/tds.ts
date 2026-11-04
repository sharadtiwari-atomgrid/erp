import { tdsQuarterOf } from "@/lib/finance/chart";

/** TDS / TCS helpers shared by the tax pages (safe on the client). */

export type TaxKind = "TDS" | "TCS";
export const kindOf = (v: string | null | undefined): TaxKind => (v === "TCS" ? "TCS" : "TDS");
export const STATUSES = ["PENDING", "DEPOSITED", "FILED"] as const;

/** The last `count` quarters, newest first, e.g. "Q3 FY 2026-27". */
export function recentQuarters(todayIso: string, count = 8): string[] {
  const out: string[] = [];
  let [y, m] = todayIso.split("-").map(Number);
  for (let i = 0; i < count; i++) {
    out.push(tdsQuarterOf(`${y}-${String(m).padStart(2, "0")}-01`));
    m -= 3;
    if (m < 1) {
      m += 12;
      y -= 1;
    }
  }
  return [...new Set(out)];
}

/** Return form for the kind: 26Q for TDS on non-salary payments, 27EQ for TCS. */
export const returnForm = (kind: TaxKind) => (kind === "TCS" ? "Form 27EQ" : "Form 26Q");

/**
 * Rate for a deductee: the company rate when the PAN's 4th character is "C"
 * (company), else the individual / HUF rate. Without a PAN, section 206AA /
 * 206CC asks for the higher of twice the rate or 20% (5% for TCS); we flag it
 * and leave the choice to the user.
 */
export function defaultRate(section: { rateIndividual: number; rateCompany: number }, pan: string | null | undefined): number {
  const p = (pan ?? "").trim().toUpperCase();
  return p.length >= 4 && p[3] === "C" ? section.rateCompany : section.rateIndividual;
}
