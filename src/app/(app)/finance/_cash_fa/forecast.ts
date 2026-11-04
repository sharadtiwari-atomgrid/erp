/**
 * Cash flow forecast bucketing (pure, client-safe).
 * Items dated before the first bucket (overdue) fall into the first bucket;
 * items after the last bucket are reported separately as "later".
 */

import { money } from "@/lib/finance/chart";

export type ForecastSource = "receivables" | "salesOrders" | "payables" | "purchaseOrders";

export type ForecastItem = { date: string; amount: number; source: ForecastSource };

export type Bucket = { start: string; end: string; label: string };

export type ForecastRow = Bucket & {
  opening: number;
  receivables: number;
  salesOrders: number;
  inflow: number;
  payables: number;
  purchaseOrders: number;
  outflow: number;
  net: number;
  closing: number;
  negative: boolean;
};

const DAY = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** `count` seven-day buckets starting today (week 1 = today … today + 6). */
export function weekBuckets(todayIso: string, count = 12): Bucket[] {
  return Array.from({ length: count }, (_, i) => {
    const start = addDays(todayIso, i * 7);
    const end = addDays(start, 6);
    return { start, end, label: `Wk ${i + 1} · ${dm(start)}–${dm(end)}` };
  });
}

/** `count` calendar-month buckets; the first runs from today to the end of this month. */
export function monthBuckets(todayIso: string, count = 3): Bucket[] {
  const [y, m] = todayIso.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const year = y + Math.floor((m - 1 + i) / 12);
    const month = ((m - 1 + i) % 12) + 1;
    const first = `${year}-${String(month).padStart(2, "0")}-01`;
    const last = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    return { start: i === 0 ? todayIso : first, end: last, label: `${MONTHS[month - 1]} ${year}` };
  });
}

const INFLOW: ForecastSource[] = ["receivables", "salesOrders"];

/** Places items in buckets and runs the closing balance forward from the opening cash. */
export function buildForecast(openingCash: number, items: ForecastItem[], buckets: Bucket[]): { rows: ForecastRow[]; laterIn: number; laterOut: number } {
  const sums = buckets.map(() => ({ receivables: 0, salesOrders: 0, payables: 0, purchaseOrders: 0 }));
  let laterIn = 0;
  let laterOut = 0;
  const last = buckets.at(-1);
  for (const item of items) {
    if (!item.amount) continue;
    if (!last || item.date > last.end) {
      if (INFLOW.includes(item.source)) laterIn += item.amount;
      else laterOut += item.amount;
      continue;
    }
    let idx = buckets.findIndex((b) => item.date <= b.end);
    if (idx < 0) idx = 0;
    sums[idx][item.source] += item.amount;
  }
  let running = money(openingCash);
  const rows = buckets.map((b, i) => {
    const s = sums[i];
    const inflow = money(s.receivables + s.salesOrders);
    const outflow = money(s.payables + s.purchaseOrders);
    const opening = running;
    const closing = money(opening + inflow - outflow);
    running = closing;
    return {
      ...b,
      opening,
      receivables: money(s.receivables),
      salesOrders: money(s.salesOrders),
      inflow,
      payables: money(s.payables),
      purchaseOrders: money(s.purchaseOrders),
      outflow,
      net: money(inflow - outflow),
      closing,
      negative: closing < 0,
    };
  });
  return { rows, laterIn: money(laterIn), laterOut: money(laterOut) };
}
