/**
 * Pure maths behind the B2B views: Shipments summary, In transit (control
 * tower), Planned and Delivered. Every function takes `today` (YYYY-MM-DD, IST).
 */
import { daysBetween } from "@/lib/ops/dates";
import { hasDoc, isDelivered, isDispatchPlan, isTransit, type FpoRow, type MisRow } from "./rows";

/* ---------------- Shipments summary (per Logistics PoC) ---------------- */

export type TimelineRow = { poc: string; shipments: number; today: number; tom: number; post: number; na: number; actToday: number; notActToday: number };
const TIMELINE_KEYS = ["shipments", "today", "tom", "post", "na", "actToday", "notActToday"] as const;

/** today-or-before | tomorrow | post-tomorrow | na */
export function etaBucket(date: string, today: string): "today" | "tom" | "post" | "na" {
  const diff = daysBetween(today, date);
  if (diff === null) return "na";
  if (diff <= 0) return "today";
  if (diff === 1) return "tom";
  return "post";
}

/** Per-PoC timeline for a set of rows: planned date buckets plus "actual is today" / "due but not today". */
export function timeline(rows: MisRow[], dateKey: "plannedEtd" | "plannedEta", actualKey: "actualEtd" | "actualEta", today: string) {
  const blank = (poc: string): TimelineRow => ({ poc, shipments: 0, today: 0, tom: 0, post: 0, na: 0, actToday: 0, notActToday: 0 });
  const byPoc = new Map<string, TimelineRow>();
  for (const e of rows) {
    const poc = e.logisticsPoc?.trim() || "Unassigned";
    const r = byPoc.get(poc) ?? blank(poc);
    r.shipments++;
    const b = etaBucket(e[dateKey], today);
    r[b]++;
    if (e[actualKey] === today) r.actToday++;
    else if (b === "today") r.notActToday++;
    byPoc.set(poc, r);
  }
  const list = [...byPoc.values()].sort((a, b) => b.shipments - a.shipments);
  const total = blank("Total");
  for (const r of list) for (const k of TIMELINE_KEYS) total[k] += r[k];
  return { rows: list, total };
}

export function shipmentsSummary(mis: MisRow[], fpo: Pick<FpoRow, "board">[], today: string) {
  const dispatch = mis.filter(isDispatchPlan);
  const transit = mis.filter(isTransit);
  const last4 = mis.filter((e) => {
    if (!isDelivered(e)) return false;
    const diff = daysBetween(e.actualEta || e.plannedEta, today);
    return diff !== null && diff >= 0 && diff <= 3;
  });
  return {
    toPlan: fpo.filter((p) => p.board === "FRESH").length,
    longHold: fpo.filter((p) => p.board === "LONG_HOLD").length,
    dispatchCount: dispatch.length,
    transitCount: transit.length,
    pickup: timeline(dispatch, "plannedEtd", "actualEtd", today),
    delivery: timeline(transit, "plannedEta", "actualEta", today),
    pickupX2: dispatch.length * 2 + transit.length,
    last4: last4.length,
    last4Rows: last4.sort((a, b) => (b.actualEta || b.plannedEta).localeCompare(a.actualEta || a.plannedEta)),
  };
}

/* ---------------- In transit control tower ---------------- */

export const TRANSIT_FILTERS = [
  { key: "all", label: "All" },
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "ETA Today" },
  { key: "next3", label: "Next 3 Days" },
  { key: "late", label: "Late vs Plan" },
] as const;
export type TransitFilter = (typeof TRANSIT_FILTERS)[number]["key"];

export type TransitShipment = {
  e: MisRow;
  /** Days until the ETA (negative = overdue), null without one. */
  days: number | null;
  /** Actual ETA minus planned ETA, null unless both are set. */
  variance: number | null;
  /** Days from actual ETD to ETA. */
  transit: number | null;
};

export function transitShipments(mis: MisRow[], today: string): TransitShipment[] {
  return mis.filter(isTransit).map((e) => {
    const eta = e.actualEta || e.plannedEta;
    return {
      e,
      days: eta ? daysBetween(today, eta) : null,
      variance: e.actualEta && e.plannedEta ? daysBetween(e.plannedEta, e.actualEta) : null,
      transit: e.actualEtd && eta ? daysBetween(e.actualEtd, eta) : null,
    };
  });
}

export function matchesTransitFilter(s: TransitShipment, f: TransitFilter): boolean {
  if (f === "overdue") return s.days !== null && s.days < 0;
  if (f === "today") return s.days === 0;
  if (f === "next3") return s.days !== null && s.days >= 1 && s.days <= 3;
  if (f === "late") return s.variance !== null && s.variance > 0;
  return true;
}

export function transitCounts(list: TransitShipment[]): Record<TransitFilter, number> {
  return Object.fromEntries(TRANSIT_FILTERS.map((f) => [f.key, list.filter((s) => matchesTransitFilter(s, f.key)).length])) as Record<
    TransitFilter,
    number
  >;
}

export function reachingLabel(d: number | null): string {
  if (d === null) return "ETA NA";
  if (d < 0) return `Overdue by ${-d}d`;
  if (d === 0) return "Due today";
  return `Due in ${d}d`;
}

export function varianceLabel(v: number | null): string {
  if (v === null || v === 0) return "On plan";
  return v > 0 ? `Late by ${v}d` : `${-v}d early`;
}

/* ---------------- Planned ---------------- */

/** Anything not yet on the road or closed out (needs a status), by planned ETD (blank last). */
export function plannedShipments(mis: MisRow[]): MisRow[] {
  return mis
    .filter((e) => e.status && e.status !== "INTRANSIT" && e.status !== "DELIVERED" && e.status !== "CANCELLED")
    .sort((a, b) => (a.plannedEtd || "9").localeCompare(b.plannedEtd || "9"));
}

/* ---------------- Delivered ---------------- */

export type DeliveredShipment = MisRow & { deliveredOn: string; slip: number | null; mkey: string; transit: number | null };

export function deliveredShipments(mis: MisRow[]): DeliveredShipment[] {
  return mis
    .filter(isDelivered)
    .map((e) => {
      const deliveredOn = e.actualEta || e.plannedEta;
      return {
        ...e,
        deliveredOn,
        slip: e.actualEta && e.plannedEta ? daysBetween(e.plannedEta, e.actualEta) : null,
        mkey: deliveredOn.slice(0, 7),
        transit: e.actualEtd && deliveredOn ? daysBetween(e.actualEtd, deliveredOn) : null,
      };
    })
    .sort((a, b) => (b.deliveredOn || "").localeCompare(a.deliveredOn || "") || (a.deliveredOn ? 0 : 1) - (b.deliveredOn ? 0 : 1));
}

export function deliveredStats(all: DeliveredShipment[], month: string, today: string) {
  const filtered = month ? all.filter((d) => d.mkey === month) : all;
  const last4 = all.filter((d) => {
    const diff = d.deliveredOn ? daysBetween(d.deliveredOn, today) : null;
    return diff !== null && diff >= 0 && diff <= 3;
  });
  const rated = filtered.filter((d) => d.slip !== null);
  const onTime = rated.filter((d) => (d.slip ?? 0) <= 0).length;
  const withPod = filtered.filter((d) => hasDoc(d, "pod")).length;
  return {
    filtered,
    last4,
    months: [...new Set(all.map((d) => d.mkey).filter(Boolean))].sort().reverse(),
    onTimePct: rated.length ? Math.round((onTime / rated.length) * 100) : null,
    podPct: filtered.length ? Math.round((withPod / filtered.length) * 100) : 0,
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return MONTHS[Number(m) - 1] ? `${MONTHS[Number(m) - 1]} ${y}` : key;
}
