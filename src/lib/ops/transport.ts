/**
 * Transport helpers for Domestic B2B (payables, performance, finder).
 * Ported from the Domestic B2B CRM's transport/utils.js and finder-engine.js.
 *
 * Pure functions over MisJob-shaped plain objects, so they run on the server,
 * in Client Components and in tests. Dates may be Date objects (Prisma) or
 * YYYY-MM-DD strings; amounts may be numbers, strings or Prisma Decimals.
 */
import { daysBetween as daysBetweenIso, isoFromDay, todayIso } from "./dates";

type Numeric = number | string | { toString(): string } | null | undefined;
type Day = Date | string | null | undefined;

/** The MisJob fields the transport reports read. `hasPod` = a POD OpsFile exists. */
export type TransportJob = {
  id: string;
  jobNo?: string | null;
  status?: string | null;
  customer?: string | null;
  supplier?: string | null;
  quantityKgs?: Numeric;
  plannedEtd?: Day;
  plannedEta?: Day;
  actualEtd?: Day;
  actualEta?: Day;
  pickupAddress?: string | null;
  pickupPincode?: string | null;
  dropAddress?: string | null;
  dropPincode?: string | null;
  vehicleType?: string | null;
  transporterDetails?: string | null;
  totalLogisticsCost?: Numeric;
  logisticsCostAgToPay?: Numeric;
  logisticsPaymentTerm?: string | null;
  distanceApprox?: Numeric;
  taxableValue?: Numeric;
  transportPaymentStatus?: string | null;
  transportPaidSoFar?: Numeric;
  hasPod?: boolean;
};

// ─── Small helpers ───────────────────────────────────────────────────────────

/**
 * First number in a value ("₹ 12,500/-" → 12500). Notes such as
 * "6500+ 2300 (Job no 976)" give 6500 rather than gluing the digits together.
 */
export function amount(v: Numeric): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const m = String(v).replace(/,/g, "").match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

/** A Date or a YYYY-MM-DD string → YYYY-MM-DD ("" when missing). */
export function dayIso(d: Day): string {
  if (!d) return "";
  if (typeof d === "string") return /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : isoFromDay(new Date(d));
  return Number.isNaN(d.getTime()) ? "" : isoFromDay(d);
}

export function daysBetween(a: Day, b: Day): number | null {
  const x = dayIso(a), y = dayIso(b);
  return x && y ? daysBetweenIso(x, y) : null;
}

const statusText = (e: { status?: string | null }) => String(e.status ?? "");
export const isDelivered = (e: { status?: string | null }) => /delivered/i.test(statusText(e));
export const isCancelled = (e: { status?: string | null }) => /cancel/i.test(statusText(e));
export const isInTransit = (e: { status?: string | null }) => /transit/i.test(statusText(e));

/** Still owed to the transporter: Logistics Cost (AG to Pay), less what's gone out on a Partially Paid shipment. */
export function owedAmount(e: Pick<TransportJob, "logisticsCostAgToPay" | "transportPaymentStatus" | "transportPaidSoFar">): number {
  const ag = amount(e.logisticsCostAgToPay);
  if (!/partial/i.test(String(e.transportPaymentStatus ?? ""))) return ag;
  return Math.max(0, ag - amount(e.transportPaidSoFar));
}

export const median = (xs: Array<number | null | undefined>): number | null => {
  const a = xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/** Phone → digits for tel: / WhatsApp links (10-digit Indian numbers get 91). */
export function phoneDigits(s: string | null | undefined): string {
  const d = String(s ?? "").replace(/[^0-9]/g, "");
  if (d.length === 10) return "91" + d;
  if (d.length === 12 && d.startsWith("91")) return d;
  return d.length >= 10 ? d : "";
}

/** CSV text with a BOM so Excel opens it as UTF-8. */
export function toCsv(header: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return "﻿" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}

// ─── Transporter names ───────────────────────────────────────────────────────

/**
 * "Transporter Details" is free text (often "Name (GSTIN …)" or "Name, phone").
 * A master transporter name (longest first) found in the text wins, so spellings
 * group together; otherwise the text before "(", ",", "|", a newline or " - " is
 * taken and title-cased.
 */
export function makeTransporterResolver(transporterNames: Iterable<string | { name?: string | null }>) {
  const names = [...transporterNames]
    .map((t) => String((typeof t === "string" ? t : t.name) ?? "").trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  return (raw: string | null | undefined): string => {
    const text = String(raw ?? "").trim();
    if (!text) return "";
    const low = text.toLowerCase();
    const hit = names.find((n) => low.includes(n.toLowerCase()));
    if (hit) return hit;
    const head = text.split(/[(,|\n]| - |–/)[0].trim();
    return head.replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };
}

// ─── Pincodes / routes ───────────────────────────────────────────────────────

/** Last 6-digit number in an address. */
export function lastPin(text: string | null | undefined): string {
  const all = String(text ?? "").match(/(?<!\d)\d{6}(?!\d)/g);
  return all ? all[all.length - 1] : "";
}

export type PinContact = { name: string; pincode?: string | null; roles?: readonly string[] | null };

const nameKey = (s: string | null | undefined) => String(s ?? "").trim().toLowerCase();

/**
 * MIS pincode fields are often empty, but addresses usually end with a 6-digit
 * pincode; the contact master (supplier for pickup, customer for drop) is the fallback.
 */
export function makePinResolver(contacts: readonly PinContact[]) {
  const sup: Record<string, string> = {}, cust: Record<string, string> = {}, any: Record<string, string> = {};
  for (const c of contacts) {
    const pin = String(c.pincode ?? "").trim();
    if (!pin) continue;
    const k = nameKey(c.name);
    if (c.roles?.includes("SUPPLIER")) sup[k] ||= pin;
    if (c.roles?.includes("CUSTOMER")) cust[k] ||= pin;
    any[k] ||= pin;
  }
  return (e: Pick<TransportJob, "pickupPincode" | "pickupAddress" | "supplier" | "dropPincode" | "dropAddress" | "customer">) => ({
    from: String(e.pickupPincode ?? "").trim() || lastPin(e.pickupAddress) || sup[nameKey(e.supplier)] || any[nameKey(e.supplier)] || "",
    to: String(e.dropPincode ?? "").trim() || lastPin(e.dropAddress) || cust[nameKey(e.customer)] || any[nameKey(e.customer)] || "",
  });
}

/** Indian PIN digits: 1st = zone, 2 = postal circle (~state), 3 = sorting district. */
export function pinMatch(a: string, b: string): 0 | 1 | 2 | 3 {
  if (!a || !b) return 0;
  if (a === b) return 3;
  if (a.slice(0, 3) === b.slice(0, 3)) return 2;
  if (a.slice(0, 2) === b.slice(0, 2)) return 1;
  return 0;
}

export type Zone = "North" | "West" | "South" | "East" | "Central";
/** Broad zone from the first PIN digit. */
export function zoneOf(pin: string | null | undefined): Zone | "" {
  const d = Number(String(pin ?? "").charAt(0));
  if (!d) return "";
  return d <= 2 ? "North" : d <= 4 ? "West" : d <= 6 ? "South" : d <= 8 ? "East" : "Central";
}

// ─── Payables ────────────────────────────────────────────────────────────────

/** Age buckets in days since delivery (else dispatch). */
export const AGE_BUCKETS = [
  { key: "b0", label: "0–15 days", max: 15, tone: "" },
  { key: "b1", label: "16–30 days", max: 30, tone: "" },
  { key: "b2", label: "31–45 days", max: 45, tone: "warn" },
  { key: "b3", label: "46–60 days", max: 60, tone: "warn" },
  { key: "b4", label: "60+ days", max: Infinity, tone: "bad" },
] as const;
export type AgeBucket = (typeof AGE_BUCKETS)[number]["key"];

export function bucketOf(age: number): AgeBucket {
  return AGE_BUCKETS.find((b) => age <= b.max)!.key;
}
export const bucketLabel = (key: AgeBucket) => AGE_BUCKETS.find((b) => b.key === key)!.label;

/** "To pay" (customer pays on delivery) and "Sx to pay" (supplier pays) are not AG payables. */
export const OTHERS_PAY = /^\s*(sx\s+)?to pay\b/i;
export const SETTLED = /^(paid|not applicable)$/i;

/** "Payment Aligned" = approved for payment but not yet disbursed: still owed. */
export const isAligned = (e: Pick<TransportJob, "transportPaymentStatus">) => /aligned/i.test(e.transportPaymentStatus ?? "");
export type PayStage = "pending" | "aligned";
export const PAY_STAGES: Record<PayStage, { label: string; sub: string }> = {
  pending: { label: "Not yet aligned", sub: "Pending / not set / on hold" },
  aligned: { label: "Aligned, not disbursed", sub: "Payment Aligned — awaiting payout" },
};
export const stageOf = (e: Pick<TransportJob, "transportPaymentStatus">): PayStage => (isAligned(e) ? "aligned" : "pending");

/** Is this job an AG payable at all (delivered or not)? Returns the owed amount, or 0 when excluded. */
export function payableAmount(e: TransportJob): number {
  if (isCancelled(e) || OTHERS_PAY.test(String(e.logisticsPaymentTerm ?? ""))) return 0;
  if (SETTLED.test(String(e.transportPaymentStatus ?? "").trim())) return 0;
  return owedAmount(e);
}

export type PayableRow<T extends TransportJob = TransportJob> = T & { transporter: string; amount: number };
export type DueRow<T extends TransportJob = TransportJob> = PayableRow<T> & { age: number; bucket: AgeBucket };

/**
 * Splits jobs into payables (delivered: owed now, with age and bucket) and
 * upcoming (not yet delivered, owed once delivered).
 */
export function buildPayables<T extends TransportJob>(
  jobs: readonly T[],
  resolve: (raw: string | null | undefined) => string,
  today: string = todayIso(),
): { dues: DueRow<T>[]; upcoming: PayableRow<T>[] } {
  const dues: DueRow<T>[] = [], upcoming: PayableRow<T>[] = [];
  for (const e of jobs) {
    const owed = payableAmount(e);
    if (!owed) continue;
    const row: PayableRow<T> = { ...e, transporter: resolve(e.transporterDetails) || "(transporter not set)", amount: owed };
    if (!isDelivered(e)) {
      upcoming.push(row);
      continue;
    }
    const from = dayIso(e.actualEta) || dayIso(e.actualEtd);
    const age = from && from <= today ? (daysBetween(from, today) ?? 0) : 0;
    dues.push({ ...row, age, bucket: bucketOf(age) });
  }
  return { dues, upcoming };
}

export type PayablesByTransporter<T extends TransportJob = TransportJob> = {
  name: string;
  total: number;
  count: number;
  oldest: number;
  pending: number;
  aligned: number;
  buckets: Record<AgeBucket, number>;
  items: DueRow<T>[];
};

export function groupPayables<T extends TransportJob>(dues: readonly DueRow<T>[]): PayablesByTransporter<T>[] {
  const by: Record<string, PayablesByTransporter<T>> = {};
  for (const d of dues) {
    const r = (by[d.transporter] ||= {
      name: d.transporter, total: 0, count: 0, oldest: 0, pending: 0, aligned: 0, items: [],
      buckets: { b0: 0, b1: 0, b2: 0, b3: 0, b4: 0 },
    });
    r.buckets[d.bucket] += d.amount;
    r[stageOf(d)] += d.amount;
    r.total += d.amount;
    r.count++;
    r.oldest = Math.max(r.oldest, d.age);
    r.items.push(d);
  }
  for (const r of Object.values(by)) r.items.sort((a, b) => b.age - a.age);
  return Object.values(by).sort((a, b) => b.total - a.total);
}

// ─── Performance ─────────────────────────────────────────────────────────────

export const PERFORMANCE_PERIODS = [
  ["30", "Last 30 days"],
  ["90", "Last 90 days"],
  ["180", "Last 6 months"],
  ["365", "Last 12 months"],
  ["all", "All time"],
] as const;
export type PerformancePeriod = (typeof PERFORMANCE_PERIODS)[number][0];

export type ShipmentMeasure = {
  /** Actual ETD → Actual ETA, only when ≥ 0. */
  tat: number | null;
  /** Actual ETA − Planned ETA: > 0 late, ≤ 0 on time, null when dates are missing. */
  delay: number | null;
  late: boolean;
  onTime: boolean;
  cost: number;
  kg: number;
  value: number;
  pod: boolean;
};

export function measure(e: TransportJob): ShipmentMeasure {
  const tat = daysBetween(e.actualEtd, e.actualEta);
  const delay = daysBetween(e.plannedEta, e.actualEta);
  return {
    tat: tat !== null && tat >= 0 ? tat : null,
    delay,
    late: delay !== null && delay > 0,
    onTime: delay !== null && delay <= 0,
    cost: amount(e.totalLogisticsCost),
    kg: amount(e.quantityKgs),
    value: amount(e.taxableValue),
    pod: Boolean(e.hasPod),
  };
}

export type PerformanceRow<T extends TransportJob = TransportJob> = {
  name: string;
  delivered: number;
  tatSum: number;
  tatN: number;
  onTime: number;
  late: number;
  lateDays: number;
  lateFreight: number;
  lateValue: number;
  freight: number;
  kgPriced: number;
  freightPriced: number;
  pod: number;
  rows: Array<T & ShipmentMeasure>;
  avgTat: number | null;
  onTimePct: number | null;
  avgDelay: number | null;
  perKg: number | null;
  podPct: number | null;
  podMissing: number;
};

const avg = (sum: number, n: number) => (n ? sum / n : null);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);

function blank<T extends TransportJob>(name: string): PerformanceRow<T> {
  return {
    name, delivered: 0, tatSum: 0, tatN: 0, onTime: 0, late: 0, lateDays: 0, lateFreight: 0, lateValue: 0,
    freight: 0, kgPriced: 0, freightPriced: 0, pod: 0, rows: [],
    avgTat: null, onTimePct: null, avgDelay: null, perKg: null, podPct: null, podMissing: 0,
  };
}
function add<T extends TransportJob>(r: PerformanceRow<T>, e: T, m: ShipmentMeasure) {
  r.delivered++;
  if (m.tat !== null) { r.tatSum += m.tat; r.tatN++; }
  if (m.onTime) r.onTime++;
  if (m.late) { r.late++; r.lateDays += m.delay ?? 0; r.lateFreight += m.cost; r.lateValue += m.value; }
  r.freight += m.cost;
  if (m.cost && m.kg) { r.freightPriced += m.cost; r.kgPriced += m.kg; }
  if (m.pod) r.pod++;
  r.rows.push({ ...e, ...m });
}
function finish<T extends TransportJob>(r: PerformanceRow<T>): PerformanceRow<T> {
  return {
    ...r,
    avgTat: avg(r.tatSum, r.tatN),
    onTimePct: pct(r.onTime, r.onTime + r.late),
    avgDelay: avg(r.lateDays, r.late),
    perKg: r.kgPriced ? r.freightPriced / r.kgPriced : null,
    podPct: pct(r.pod, r.delivered),
    podMissing: r.delivered - r.pod,
  };
}

/**
 * Delivered shipments in the period (by delivery date: Actual ETA, else Actual
 * ETD), grouped by resolved transporter, with totals across all transporters.
 */
export function buildPerformance<T extends TransportJob>(
  jobs: readonly T[],
  resolve: (raw: string | null | undefined) => string,
  period: PerformancePeriod | string = "90",
  today: string = todayIso(),
) {
  const days = Number(period);
  const cutoff = period === "all" || !Number.isFinite(days) ? "" : isoFromDay(new Date(Date.parse(`${today}T00:00:00Z`) - days * 86_400_000));
  const by: Record<string, PerformanceRow<T>> = {};
  const total = blank<T>("All transporters");
  let inTransit = 0, noTransporter = 0;
  for (const e of jobs) {
    if (isCancelled(e)) continue;
    if (!isDelivered(e)) {
      if (isInTransit(e)) inTransit++;
      continue;
    }
    const day = dayIso(e.actualEta) || dayIso(e.actualEtd);
    if (cutoff && (!day || day < cutoff)) continue;
    const name = resolve(e.transporterDetails);
    if (!name) { noTransporter++; continue; }
    const m = measure(e);
    add((by[name] ||= blank<T>(name)), e, m);
    add(total, e, m);
  }
  return { rows: Object.values(by).map(finish), total: finish(total), inTransit, noTransporter };
}

/** Tile / cell tone: on-time ≥ 90 good, ≥ 75 warn; POD ≥ 95 good, ≥ 80 warn. */
export function pctTone(p: number | null, good = 90, ok = 75): "good" | "warn" | "bad" | "none" {
  return p === null ? "none" : p >= good ? "good" : p >= ok ? "warn" : "bad";
}
export const onTimeTone = (p: number | null) => pctTone(p, 90, 75);
export const podTone = (p: number | null) => pctTone(p, 95, 80);

export const PERFORMANCE_CSV_HEADER = [
  "Transporter", "Delivered", "Avg TAT (days)", "On time", "Delayed", "On-time %", "Total delay days", "Avg delay (days)",
  "Freight on delayed (Rs.)", "Cargo value delayed (Rs.)", "Avg Rs./kg", "Freight (Rs.)", "POD received", "POD missing", "POD %",
];
export function performanceCsvRow(r: PerformanceRow) {
  return [
    r.name, r.delivered, r.avgTat?.toFixed(1) ?? "", r.onTime, r.late, r.onTimePct ?? "", r.lateDays,
    r.avgDelay?.toFixed(1) ?? "", Math.round(r.lateFreight), Math.round(r.lateValue), r.perKg?.toFixed(2) ?? "",
    Math.round(r.freight), r.pod, r.podMissing, r.podPct ?? "",
  ];
}

export const PAYABLES_CSV_HEADER = [
  "Transporter", "Job No.", "Customer", "Supplier", "Dispatched", "Delivered", "Age (days)", "Age bucket",
  "Logistics Cost (AG to Pay) (Rs.)", "Total Logistics Cost (Rs.)", "Payment status", "Stage", "POD",
];

// ─── Finder ──────────────────────────────────────────────────────────────────

export const TIERS = {
  3: { label: "Exact route", short: "Exact", tone: "ok" },
  2: { label: "Nearby", short: "Nearby", tone: "warn" },
  1: { label: "Same states", short: "Same states", tone: "" },
} as const;
export type Tier = 1 | 2 | 3;

export type Trip<T extends TransportJob = TransportJob> = T & {
  tx: string;
  from: string;
  to: string;
  /** Actual ETD, else Planned ETD (YYYY-MM-DD or ""). */
  day: string;
  cost: number;
  kg: number;
  km: number | null;
  perKg: number | null;
  delay: number | null;
  transit: number | null;
  load: "FTL" | "PTL" | "";
};

/** One trip per non-cancelled MIS row that has a transporter. */
export function buildTrips<T extends TransportJob>(
  jobs: readonly T[],
  resolve: (raw: string | null | undefined) => string,
  pins: (e: T) => { from: string; to: string },
): Trip<T>[] {
  return jobs
    .filter((e) => !isCancelled(e))
    .map((e) => {
      const p = pins(e), cost = amount(e.totalLogisticsCost), kg = amount(e.quantityKgs);
      const delivered = isDelivered(e);
      const delay = delivered ? daysBetween(e.plannedEta, e.actualEta) : null;
      const transit = delivered ? daysBetween(e.actualEtd, e.actualEta) : null;
      const vt = e.vehicleType ?? "";
      return {
        ...e,
        tx: resolve(e.transporterDetails), from: p.from, to: p.to,
        day: dayIso(e.actualEtd) || dayIso(e.plannedEtd),
        cost, kg, km: amount(e.distanceApprox) || null, perKg: cost && kg ? cost / kg : null,
        delay, transit: transit !== null && transit >= 0 ? transit : null,
        load: /ftl/i.test(vt) ? "FTL" : /ptl/i.test(vt) ? "PTL" : "",
      } as Trip<T>;
    })
    .filter((t) => t.tx);
}

export type OverallRecord = { trips: number; timed: number; onTime: number; last: string; onTimePct: number | null };

/** Overall on-time record per transporter across all routes. */
export function overallRecord(trips: readonly Trip[]): Record<string, OverallRecord> {
  const by: Record<string, OverallRecord> = {};
  for (const t of trips) {
    const r = (by[t.tx] ||= { trips: 0, timed: 0, onTime: 0, last: "", onTimePct: null });
    r.trips++;
    if (t.day && (!r.last || t.day > r.last)) r.last = t.day;
    if (t.delay !== null) { r.timed++; if (t.delay <= 0) r.onTime++; }
  }
  for (const r of Object.values(by)) r.onTimePct = r.timed ? Math.round((r.onTime / r.timed) * 100) : null;
  return by;
}

const qtyFits = (qty: number, min: number, max: number) => qty >= min * 0.75 && qty <= max * 1.25;

export type HistoryCandidate<T extends TransportJob = TransportJob> = {
  name: string;
  tier: Tier;
  trips: Array<Trip<T> & { tier: Tier }>;
  otherTrips: number;
  all: Array<Trip<T> & { tier: Tier }>;
  qMin: number | null;
  qMax: number | null;
  qtyFit: boolean | null;
  avgPerKg: number | null;
  lastPerKg: number | null;
  transit: number | null;
  km: number | null;
  onTimePct: number | null;
  onTimeBasis: "route" | "overall";
  onTimeN: number;
  lastDay: string;
  loads: string;
  score: number;
};

/** Ranks transporters from history for a route. A / B are pincodes (either may be ""). */
export function rankHistory<T extends TransportJob>({
  trips, A, B, qty, load, overall,
}: {
  trips: readonly Trip<T>[];
  A: string;
  B: string;
  qty: number;
  load: "" | "PTL" | "FTL";
  overall: Record<string, OverallRecord>;
}): HistoryCandidate<T>[] {
  const by: Record<string, Array<Trip<T> & { tier: Tier }>> = {};
  for (const t of trips) {
    if (load && t.load !== load) continue;
    const tier = Math.min(A ? pinMatch(A, t.from) : 3, B ? pinMatch(B, t.to) : 3);
    if (!tier) continue;
    (by[t.tx] ||= []).push({ ...t, tier: tier as Tier });
  }
  const byDayDesc = (a: { day: string }, b: { day: string }) => (b.day || "").localeCompare(a.day || "");
  const cands: HistoryCandidate<T>[] = Object.entries(by).map(([name, list]) => {
    const tier = Math.max(...list.map((x) => x.tier)) as Tier;
    const close = list.filter((x) => x.tier === tier).sort(byDayDesc);
    const kgs = close.map((x) => x.kg).filter(Boolean);
    const priced = close.filter((x) => x.perKg);
    const pKg = priced.reduce((s, x) => s + x.kg, 0), pCost = priced.reduce((s, x) => s + x.cost, 0);
    const timed = close.filter((x) => x.delay !== null);
    const routeOnTime = timed.length >= 3 ? Math.round((timed.filter((x) => (x.delay ?? 0) <= 0).length / timed.length) * 100) : null;
    const all = overall[name];
    const qMin = kgs.length ? Math.min(...kgs) : null, qMax = kgs.length ? Math.max(...kgs) : null;
    return {
      name, tier, trips: close, otherTrips: list.length - close.length,
      all: [...list].sort((a, b) => b.tier - a.tier || byDayDesc(a, b)),
      qMin, qMax, qtyFit: qty > 0 && qMin !== null && qMax !== null ? qtyFits(qty, qMin, qMax) : null,
      avgPerKg: pKg ? pCost / pKg : null, lastPerKg: priced[0]?.perKg ?? null,
      transit: median(close.map((x) => x.transit)), km: median(close.map((x) => x.km)),
      onTimePct: routeOnTime ?? all?.onTimePct ?? null, onTimeBasis: routeOnTime !== null ? "route" : "overall",
      onTimeN: routeOnTime !== null ? timed.length : all?.timed || 0,
      lastDay: close[0]?.day || "", loads: [...new Set(close.map((x) => x.load).filter(Boolean))].join(" / "),
      score: 0,
    };
  });
  // Cheapest avg rate within each tier, for the price part of the score.
  const best: Partial<Record<Tier, number>> = {};
  for (const c of cands) if (c.avgPerKg) best[c.tier] = Math.min(best[c.tier] ?? Infinity, c.avgPerKg);
  for (const c of cands) {
    const bestRate = best[c.tier];
    const s = { 3: 40, 2: 28, 1: 16 }[c.tier]
      + (c.qtyFit === null ? 14 : c.qtyFit ? 20 : 6)
      + Math.min(15, 4 + c.trips.length * 2.5)
      + (c.onTimePct === null ? 8 : (15 * c.onTimePct) / 100)
      + (c.avgPerKg && bestRate ? (10 * bestRate) / c.avgPerKg : 5);
    c.score = Math.min(100, Math.round(s));
  }
  cands.sort((a, b) => b.tier - a.tier || b.score - a.score);
  return cands;
}

export const CARGO_TYPES = ["General", "Chemical", "Agrochemical", "Hazardous", "Pharmaceutical", "Industrial"] as const;
export type CargoType = (typeof CARGO_TYPES)[number];

export function cargoCaution(cargo: string): string {
  switch (cargo) {
    case "Hazardous": return "Hazardous cargo: verify class-specific acceptance, packaging and documents before booking.";
    case "Chemical": return "Chemical cargo: verify material, packaging, documents and route acceptance.";
    case "Agrochemical": return "Agrochemical cargo: verify product classification, packaging and carrier acceptance.";
    case "Pharmaceutical": return "Pharma cargo: confirm handling, temperature and documentation requirements.";
    default: return "Verify route and service terms before booking.";
  }
}

export type PublicLead = {
  name: string;
  scope: "Pan India" | "Regional";
  regions: Zone[];
  min_kg: number | null;
  max_kg: number | null;
  contact: string;
  email: string;
  source: string;
  evidence: string;
  note: string;
  cargo: string[];
};

/**
 * Public PTL network leads (published contact details from each company's own
 * website). These are leads, not proof of pincode serviceability, rate or acceptance.
 */
export const PUBLIC_LEADS: PublicLead[] = [
  { name: "DNS Logistics", scope: "Pan India", regions: ["North", "West", "South", "East"], min_kg: 1, max_kg: 5000, contact: "+91 90827 36097", email: "info@dnslogistic.com", source: "https://www.dnslogistic.com/services/ptl", evidence: "Official PTL page", note: "18,000+ pincode PTL positioning; 24–72 hr published major-corridor TAT.", cargo: ["General", "Industrial", "Pharmaceutical", "Hazardous"] },
  { name: "Fast Trackon Logistics", scope: "Pan India", regions: ["North", "West", "South", "East"], min_kg: 50, max_kg: 5000, contact: "+91 88288 81414", email: "support@fasttrackonlogistics.com", source: "https://www.fasttrackonlogistics.com/services/ptl", evidence: "Official PTL page", note: "28,000+ pin codes, 500+ routes, 50 kg–5 tonne published PTL range.", cargo: ["General", "Industrial"] },
  { name: "CTC India", scope: "Pan India", regions: ["North", "West", "South", "East"], min_kg: null, max_kg: null, contact: "+91 9873294018", email: "info@ctcipl.com", source: "https://www.ctcipl.com/services/part-truck-load-ptl", evidence: "Official PTL page", note: "Pan-India PTL routes are publicly listed.", cargo: ["General", "Industrial"] },
  { name: "Bombay Kandla Transport", scope: "Pan India", regions: ["North", "West", "South", "East"], min_kg: null, max_kg: null, contact: "", email: "sales@bombaykandla.com", source: "https://bktpl.co.in/", evidence: "Official company site", note: "Pan-India road network with PTL and industrial freight positioning.", cargo: ["General", "Industrial", "Chemical"] },
  { name: "VRL Logistics", scope: "Pan India", regions: ["North", "West", "South", "East"], min_kg: null, max_kg: null, contact: "1800 599 7800", email: "customercare@vrllogistics.com", source: "https://www.vrlgroup.in/", evidence: "Official company site", note: "Publishes All India Parcel Service and General Parcel (LTL).", cargo: ["General", "Industrial"] },
  { name: "TCI Express", scope: "Pan India", regions: ["North", "West", "South", "East"], min_kg: null, max_kg: null, contact: "", email: "", source: "https://www.tciexpress.in/", evidence: "Official company site", note: "National express network.", cargo: ["General", "Industrial", "Pharmaceutical"] },
  { name: "Gati", scope: "Pan India", regions: ["North", "West", "South", "East"], min_kg: null, max_kg: null, contact: "", email: "", source: "https://www.gati.com/", evidence: "Official company site", note: "National surface logistics network.", cargo: ["General", "Industrial"] },
  { name: "Vidhi Transport", scope: "Regional", regions: ["West"], min_kg: null, max_kg: null, contact: "+91 98253 21589", email: "customercare@vidhitransport.com", source: "https://vidhitransport.com/services/part-truck-load.html", evidence: "Official chemical/industrial PTL page", note: "Gujarat–Maharashtra GIDC/MIDC PTL; publishes chemical and industrial freight handling.", cargo: ["General", "Industrial", "Chemical", "Agrochemical"] },
  { name: "URTC Group", scope: "Regional", regions: ["West", "Central", "East"], min_kg: null, max_kg: null, contact: "+91 97125 18095", email: "marketing@urtcgroup.com", source: "https://www.urtcgroup.com/services/part-load-transport-services/", evidence: "Official PTL page", note: "Part-load across Gujarat, Maharashtra, Odisha and Chhattisgarh corridors.", cargo: ["General", "Industrial"] },
  { name: "Superior Transways", scope: "Regional", regions: ["West", "North", "South"], min_kg: null, max_kg: null, contact: "+91 7770026141", email: "superiortransways18@gmail.com", source: "https://superiortransways.com/part-load-transportation/", evidence: "Official PTL page", note: "Regional PTL network with West/North/South city coverage.", cargo: ["General", "Industrial"] },
  { name: "Malwa Golden Logistics", scope: "Regional", regions: ["North"], min_kg: null, max_kg: null, contact: "+91 94637 37337", email: "info@malwagolden.com", source: "https://www.malwagolden.com/", evidence: "Official company site", note: "Punjab / Haryana / Delhi-NCR PTL.", cargo: ["General", "Industrial"] },
  { name: "Mukund Logistics", scope: "Regional", regions: ["North", "Central"], min_kg: 50, max_kg: 5000, contact: "", email: "", source: "https://mukundlogistic.com/ncr/services/part-load/", evidence: "Official part-load page", note: "NCR-focused PTL/LTL with published 50 kg–5 tonne positioning.", cargo: ["General", "Industrial"] },
];

export type RankedLead = PublicLead & { region: number; cargoPublished: boolean; weightFit: boolean | null; inHistory: boolean; score: number };

/** Public network leads scored by zone coverage, cargo and weight. */
export function rankLeads({
  A, B, qty, cargo, historyNames, leads = PUBLIC_LEADS,
}: {
  A: string;
  B: string;
  qty: number;
  cargo: string;
  historyNames: Iterable<string>;
  leads?: readonly PublicLead[];
}): RankedLead[] {
  const za = zoneOf(A), zb = zoneOf(B);
  if (!za && !zb) return [];
  const known = [...historyNames].map((n) => n.toLowerCase());
  return leads
    .map((l) => {
      const both = l.scope === "Pan India" || ((!za || l.regions.includes(za)) && (!zb || l.regions.includes(zb)));
      const one = (za && l.regions.includes(za)) || (zb && l.regions.includes(zb));
      const region = both ? 30 : one ? 18 : 0;
      const cargoFit = l.cargo.includes(cargo) ? 22 : cargo === "Hazardous" && l.cargo.includes("Chemical") ? 10 : 4;
      const published = l.min_kg !== null || l.max_kg !== null;
      const weightFit = qty > 0 && published ? qty >= (l.min_kg ?? 0) && qty <= (l.max_kg ?? Infinity) : null;
      const first = l.name.toLowerCase().split(" ")[0];
      return {
        ...l, region, cargoPublished: l.cargo.includes(cargo), weightFit,
        inHistory: known.some((k) => k.includes(first)),
        score: Math.min(99, 45 + region + cargoFit + (weightFit === true ? 12 : weightFit === false ? -4 : 0)),
      };
    })
    .filter((l) => l.region > 0)
    .sort((a, b) => b.score - a.score);
}

export type PlaceSource = { name: string; pincode?: string | null; address?: string | null };

/**
 * Typed text (pincode, contact name, or a town) → pincode, via the contact
 * master (exact name, then name/address contains), then past trips' addresses.
 */
export function resolvePlace(
  text: string,
  places: readonly PlaceSource[],
  trips: ReadonlyArray<Pick<Trip, "pickupAddress" | "dropAddress" | "from" | "to">>,
): { pin: string; note: string } {
  const t = String(text ?? "").trim();
  if (!t) return { pin: "", note: "" };
  const digits = t.match(/(?<!\d)\d{6}(?!\d)/);
  if (digits) return { pin: digits[0], note: "" };
  const q = nameKey(t);
  const exact = places.find((x) => nameKey(x.name) === q && x.pincode);
  if (exact) return { pin: String(exact.pincode).trim(), note: exact.name };
  const partial = places.find((x) => x.pincode && (nameKey(x.name).includes(q) || nameKey(x.address).includes(q)));
  if (partial) return { pin: String(partial.pincode).trim(), note: partial.name };
  const pick = trips.find((e) => nameKey(e.pickupAddress).includes(q) && e.from);
  if (pick) return { pin: pick.from, note: "from past trips" };
  const drop = trips.find((e) => nameKey(e.dropAddress).includes(q) && e.to);
  if (drop) return { pin: drop.to, note: "from past trips" };
  return { pin: "", note: "not found" };
}
