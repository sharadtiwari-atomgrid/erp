/**
 * Shipment execution dashboard: filters, KPIs, chart counts, documentation
 * completeness and transport-payment buckets. Pure; ported from the source's
 * dashboard/page.js.
 */
import { daysBetween } from "@/lib/ops/dates";
import { MIS_STATUS_LABELS } from "@/lib/ops/lists";
import { MisStatus } from "@/generated/prisma/enums";
import { byJobDesc, hasDoc, isDelivered, isTransit, type MisRow } from "../../views/_lib/rows";

export const FILTER_KEYS = ["month", "customer", "supplier", "poc", "status", "logisticsType", "paymentTerm", "paymentStatus", "q"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export type Filters = Record<FilterKey, string>;

export function readFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const one = (k: string) => {
    const v = sp[k];
    return ((Array.isArray(v) ? v[0] : v) ?? "").trim();
  };
  return Object.fromEntries(FILTER_KEYS.map((k) => [k, one(k)])) as Filters;
}

const distinct = (rows: MisRow[], pick: (r: MisRow) => string | null) =>
  [...new Set(rows.map((r) => (pick(r) ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

export function filterOptions(rows: MisRow[]) {
  return {
    month: [...new Set(rows.map((r) => r.plannedEtd.slice(0, 7)).filter(Boolean))].sort().reverse(),
    customer: distinct(rows, (r) => r.customer),
    supplier: distinct(rows, (r) => r.supplier),
    poc: distinct(rows, (r) => r.agDemandPoc),
    status: Object.values(MisStatus).filter((s) => rows.some((r) => r.status === s)),
    logisticsType: distinct(rows, (r) => r.logisticsType),
    paymentTerm: distinct(rows, (r) => r.logisticsPaymentTerm),
    paymentStatus: distinct(rows, (r) => r.transportPaymentStatus),
  };
}

export function applyFilters(rows: MisRow[], f: Filters): MisRow[] {
  const q = f.q.toLowerCase();
  return rows.filter((r) => {
    if (f.month && r.plannedEtd.slice(0, 7) !== f.month) return false;
    if (f.customer && r.customer !== f.customer) return false;
    if (f.supplier && r.supplier !== f.supplier) return false;
    if (f.poc && r.agDemandPoc !== f.poc) return false;
    if (f.status && r.status !== f.status) return false;
    if (f.logisticsType && r.logisticsType !== f.logisticsType) return false;
    if (f.paymentTerm && r.logisticsPaymentTerm !== f.paymentTerm) return false;
    if (f.paymentStatus && r.transportPaymentStatus !== f.paymentStatus) return false;
    if (q) {
      const hay = [r.jobNo, r.customer, r.supplier, r.productName].map((x) => (x ?? "").toLowerCase()).join(" ");
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export const PAY_BUCKETS = [
  { key: "paid", label: "Paid ✓" },
  { key: "partial", label: "Partially paid" },
  { key: "pending", label: "Pending" },
  { key: "na", label: "Not applicable" },
  { key: "unknown", label: "Not set" },
] as const;
export type PayBucket = (typeof PAY_BUCKETS)[number]["key"];

/** Transport payment status → bucket ("Payment Aligned" = approved, not paid out yet → pending). */
export function payBucketOf(status: string | null | undefined): PayBucket {
  const v = (status ?? "").toLowerCase();
  if (!v) return "unknown";
  if (v.includes("partial")) return "partial";
  if (v.includes("not applicable") || v === "na" || v.includes("n/a")) return "na";
  if (v.includes("paid")) return "paid";
  if (v.includes("pending") || v.includes("aligned")) return "pending";
  return "unknown";
}

export type Count = { label: string; key: string; n: number };
function groupCounts(rows: MisRow[], pick: (r: MisRow) => string | null, label: (k: string) => string = (k) => k): Count[] {
  const m = new Map<string, number>();
  for (const e of rows) {
    const v = (pick(e) ?? "").trim() || "—";
    m.set(v, (m.get(v) ?? 0) + 1);
  }
  return [...m.entries()].map(([key, n]) => ({ key, label: key === "—" ? "—" : label(key), n })).sort((a, b) => b.n - a.n);
}

/** ETA Δ: actual ETA minus planned ETA (null unless both are set). */
export const etaDelta = (e: Pick<MisRow, "plannedEta" | "actualEta">) => (e.actualEta && e.plannedEta ? daysBetween(e.plannedEta, e.actualEta) : null);

export function dashboardMetrics(src: MisRow[]) {
  const total = src.length;
  const delivered = src.filter(isDelivered);
  const transit = src.filter(isTransit);
  const rated = delivered.filter((e) => e.actualEta && e.plannedEta);
  const deltas = rated.map((e) => etaDelta(e) ?? 0);
  const onTime = deltas.filter((d) => d <= 0).length;
  const late = deltas.filter((d) => d > 0);
  const avgDelay = late.length ? late.reduce((t, d) => t + d, 0) / late.length : 0;
  const pod = src.filter((e) => hasDoc(e, "pod")).length;

  const payRows: Record<PayBucket, MisRow[]> = { paid: [], partial: [], pending: [], na: [], unknown: [] };
  for (const e of src) payRows[payBucketOf(e.transportPaymentStatus)].push(e);
  const pay = Object.fromEntries(PAY_BUCKETS.map((b) => [b.key, payRows[b.key].length])) as Record<PayBucket, number>;
  const payable = pay.paid + pay.partial + pay.pending;

  return {
    total,
    deliveredN: delivered.length,
    transitN: transit.length,
    onTimePct: rated.length ? Math.round((onTime / rated.length) * 100) : null,
    avgDelay: Math.round(avgDelay * 10) / 10,
    podPct: total ? Math.round((pod / total) * 100) : 0,
    podN: pod,
    pay,
    payRows,
    payable,
    paidPct: payable ? Math.round((pay.paid / payable) * 100) : null,
    status: groupCounts(src, (r) => r.status, (k) => MIS_STATUS_LABELS[k as MisStatus] ?? k),
    logistics: groupCounts(src, (r) => r.logisticsType),
    payment: groupCounts(src, (r) => r.logisticsPaymentTerm),
    docs: [
      { label: "Tax Invoice", n: src.filter((e) => hasDoc(e, "taxInvoice")).length },
      { label: "E-Way Bill", n: src.filter((e) => hasDoc(e, "eWayBill")).length },
      { label: "COA", n: src.filter((e) => hasDoc(e, "coa")).length },
      { label: "POD", n: src.filter((e) => hasDoc(e, "pod")).length },
    ],
  };
}

/** Detail rows: highest Job No. first. */
export const detailRows = (rows: MisRow[]) => [...rows].sort(byJobDesc);

/** Donut slices (degrees) for a list of counts. */
export function donutSlices(counts: Count[]): Array<Count & { start: number; end: number }> {
  const total = counts.reduce((t, s) => t + s.n, 0) || 1;
  let acc = 0;
  return counts.map((s) => {
    const start = (acc / total) * 360;
    acc += s.n;
    return { ...s, start, end: (acc / total) * 360 };
  });
}
