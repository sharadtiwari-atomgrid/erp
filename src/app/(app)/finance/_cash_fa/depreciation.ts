/**
 * Fixed asset depreciation maths (pure, client-safe).
 *
 * - SLM (straight line): (cost − salvage) ÷ useful life, per year.
 * - WDV (written-down value): book value × rate %, per year.
 * - Pro rata by days: a span is split at financial-year boundaries (1 April);
 *   each piece is charged days ÷ days-in-that-financial-year of the annual
 *   amount, so a full year always gives exactly the annual charge. WDV uses
 *   the book value at the start of each piece, so it compounds year on year.
 * - Book value never goes below the salvage value.
 * All dates are ISO strings (YYYY-MM-DD); amounts are rounded to paise.
 */

import { fiscalYearOf, money } from "@/lib/finance/chart";

export type DepreciationMethod = "SLM" | "WDV";

export type DepreciableAsset = {
  cost: number;
  salvageValue: number;
  method: DepreciationMethod | string;
  usefulLifeYears?: number | null;
  ratePct?: number | null;
  /** Depreciation charged so far (including any brought forward). */
  accumulatedDepreciation: number;
  acquisitionDate: string;
  /** Last day already charged; null when never depreciated. */
  depreciatedTo?: string | null;
};

const DAY = 86_400_000;
const toMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function addDays(iso: string, days: number): string {
  return fromMs(toMs(iso) + days * DAY);
}

/** Days from `from` to `to`, both inclusive (0 when `to` is before `from`). */
export function daysInclusive(from: string, to: string): number {
  return Math.max(0, Math.round((toMs(to) - toMs(from)) / DAY) + 1);
}

const maxIso = (a: string, b: string) => (a > b ? a : b);
const minIso = (a: string, b: string) => (a < b ? a : b);

/** Book value = cost − accumulated depreciation. */
export function bookValue(asset: Pick<DepreciableAsset, "cost" | "accumulatedDepreciation">): number {
  return money(asset.cost - asset.accumulatedDepreciation);
}

/** Annual charge at a given opening book value. */
export function annualCharge(asset: DepreciableAsset, openingBookValue: number): number {
  if (asset.method === "WDV") {
    const rate = asset.ratePct ?? 0;
    return rate > 0 ? (openingBookValue * rate) / 100 : 0;
  }
  const life = asset.usefulLifeYears ?? 0;
  return life > 0 ? (asset.cost - asset.salvageValue) / life : 0;
}

/** Returns a message when the asset's depreciation settings are incomplete, else null. */
export function settingsProblem(asset: Pick<DepreciableAsset, "method" | "usefulLifeYears" | "ratePct" | "cost" | "salvageValue">): string | null {
  if (asset.cost <= 0) return "Cost must be more than zero.";
  if (asset.salvageValue < 0 || asset.salvageValue > asset.cost) return "Salvage value must be between zero and the cost.";
  if (asset.method === "WDV") {
    if (!asset.ratePct || asset.ratePct <= 0 || asset.ratePct > 100) return "Enter a WDV rate between 0 and 100%.";
  } else if (asset.method === "SLM") {
    if (!asset.usefulLifeYears || asset.usefulLifeYears <= 0) return "Enter a useful life for straight-line depreciation.";
  } else {
    return "Method must be SLM or WDV.";
  }
  return null;
}

export type DepreciationResult = {
  /** First and last day charged (empty when nothing is due). */
  from: string;
  to: string;
  days: number;
  openingBookValue: number;
  amount: number;
  closingBookValue: number;
};

/** First day still to be charged: the day after depreciatedTo, but never before acquisition. */
export function chargeFrom(asset: Pick<DepreciableAsset, "acquisitionDate" | "depreciatedTo">): string {
  return asset.depreciatedTo ? maxIso(addDays(asset.depreciatedTo, 1), asset.acquisitionDate) : asset.acquisitionDate;
}

/**
 * Depreciation due from max(depreciatedTo + 1 day, acquisitionDate) up to and
 * including `periodEnd`.
 */
export function depreciationFor(asset: DepreciableAsset, periodEnd: string): DepreciationResult {
  const opening = bookValue(asset);
  const from = chargeFrom(asset);
  const none = { from: "", to: "", days: 0, openingBookValue: opening, amount: 0, closingBookValue: opening };
  if (from > periodEnd || settingsProblem(asset)) return none;

  let value = opening;
  let total = 0;
  let cursor = from;
  while (cursor <= periodEnd) {
    const fy = fiscalYearOf(cursor);
    const pieceEnd = minIso(fy.end, periodEnd);
    const room = money(value - asset.salvageValue);
    if (room <= 0) break;
    const days = daysInclusive(cursor, pieceEnd);
    const yearDays = daysInclusive(fy.start, fy.end);
    const charge = Math.min(money((annualCharge(asset, value) * days) / yearDays), room);
    total = money(total + charge);
    value = money(value - charge);
    cursor = addDays(pieceEnd, 1);
  }
  if (total <= 0) return none;
  return { from, to: periodEnd, days: daysInclusive(from, periodEnd), openingBookValue: opening, amount: total, closingBookValue: money(opening - total) };
}

export type ScheduleRow = { year: string; start: string; end: string; opening: number; depreciation: number; closing: number };

/**
 * Projected depreciation by financial year, from the next uncharged day until
 * the asset is fully depreciated to its salvage value (or `maxYears` years,
 * since WDV only approaches salvage gradually). Stops once a year's charge
 * falls below one rupee.
 */
export function projectSchedule(asset: DepreciableAsset, maxYears = 40): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  if (settingsProblem(asset)) return rows;
  let state: DepreciableAsset = { ...asset };
  for (let i = 0; i < maxYears; i++) {
    const start = chargeFrom(state);
    const fy = fiscalYearOf(start);
    const r = depreciationFor(state, fy.end);
    if (r.amount <= 0) break;
    rows.push({ year: fy.name, start, end: fy.end, opening: r.openingBookValue, depreciation: r.amount, closing: r.closingBookValue });
    if (r.amount < 1 && rows.length > 1) break;
    state = { ...state, accumulatedDepreciation: money(state.accumulatedDepreciation + r.amount), depreciatedTo: fy.end };
  }
  return rows;
}

// ── Periods ────────────────────────────────────────────────────────────────

export type PeriodKind = "month" | "quarter" | "year";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** The month, financial-year quarter (Q1 = Apr–Jun) or financial year containing a date. */
export function periodRange(kind: PeriodKind, iso: string): { start: string; end: string; label: string } {
  const [y, m] = iso.split("-").map(Number);
  if (kind === "year") {
    const fy = fiscalYearOf(iso);
    return { start: fy.start, end: fy.end, label: fy.name };
  }
  if (kind === "quarter") {
    const fy = fiscalYearOf(iso);
    const q = Math.floor(((m + 8) % 12) / 3); // Apr–Jun → 0 … Jan–Mar → 3
    const startMonth = ((3 + q * 3) % 12) + 1;
    const startYear = fy.startYear + (q === 3 ? 1 : 0);
    const endMonth = startMonth + 2;
    return {
      start: `${startYear}-${pad(startMonth)}-01`,
      end: `${startYear}-${pad(endMonth)}-${pad(lastDay(startYear, endMonth))}`,
      label: `Q${q + 1} ${fy.name}`,
    };
  }
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(lastDay(y, m))}`, label: `${MONTHS[m - 1]} ${y}` };
}
