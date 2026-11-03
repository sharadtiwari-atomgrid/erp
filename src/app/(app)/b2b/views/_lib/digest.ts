/**
 * Daily digest: the reports sent to the team group every day, worked out from
 * Domestic MIS and Fresh PO. `day` (YYYY-MM-DD) is "today" for every report.
 *   summary  — Domestic Shipments Summary: dispatch plan and in-transit timelines per
 *              Logistics PoC, delivered in the last 4 days, Fresh PO and Long Hold ageing
 *   upcoming / transit / pipeline / longHold / delivered — the tables behind it
 * Pure functions (the inventory report comes from @/lib/batch-inventory).
 */
import { addDaysIso, daysBetween } from "@/lib/ops/dates";
import { byJobAsc, isCancelled, isDelivered, isFreshRow, isHold, isTransit, type FpoRow, type MisRow } from "./rows";

type Row = Pick<
  MisRow,
  | "id"
  | "jobNo"
  | "status"
  | "logisticsPoc"
  | "plannedEtd"
  | "plannedEta"
  | "actualEtd"
  | "actualEta"
  | "customer"
  | "productName"
  | "poDate"
  | "supplier"
  | "agDemandPoc"
  | "quantityKgs"
  | "cxQuoteApprovalTime"
  | "sxReadinessTime"
  | "blockersRemarks"
>;
type Po = Pick<FpoRow, "id" | "requestNo" | "board" | "stage" | "poDate" | "supplier" | "customer" | "demandPoc" | "product" | "qtyToDispatch" | "poQty" | "notes">;

const isPlanned = (e: Row) =>
  !isCancelled(e) && !isDelivered(e) && !isTransit(e) && !isHold(e) && !isFreshRow(e) && !!(e.customer || e.productName || e.jobNo);
const poc = (e: Row) => (e.logisticsPoc ?? "").trim() || "Not Assigned";
const STAGE_TEAM: Record<Po["stage"], string> = { DEMAND_PENDING: "Demand", SUPPLY_PENDING: "Supply", LOGISTICS_PENDING: "Logistics", READY: "SCM" };

export type When = "before" | "tomorrow" | "post" | "none";
/** "before" (today or earlier) | "tomorrow" | "post" | "none" for a date against `day`. */
export function when(date: string, day: string): When {
  if (!date) return "none";
  return date <= day ? "before" : date === addDaysIso(day, 1) ? "tomorrow" : "post";
}

export type PocRow<C extends string> = { poc: string } & Record<C, number>;

/** Rows per PoC (sorted, "Not Assigned" last) with a total row. */
function perPoc<C extends string>(items: Array<{ e: Row; add: C[] }>, cols: readonly C[]) {
  const m = new Map<string, PocRow<C>>();
  for (const { e, add } of items) {
    const k = poc(e);
    const o = m.get(k) ?? ({ poc: k, ...Object.fromEntries(cols.map((c) => [c, 0])) } as PocRow<C>);
    for (const c of add) (o as Record<string, number>)[c]++;
    m.set(k, o);
  }
  const rows = [...m.values()].sort(
    (a, b) => Number(a.poc === "Not Assigned") - Number(b.poc === "Not Assigned") || a.poc.localeCompare(b.poc),
  );
  const total = { poc: "Total", ...Object.fromEntries(cols.map((c) => [c, rows.reduce((s, r) => s + r[c], 0)])) } as PocRow<C>;
  return { rows, total };
}

/** Days since the PO date (null without one). */
const holding = (poDate: string, day: string) => (poDate ? daysBetween(poDate, day) : null);

/** Ages into buckets: up to each edge, over the last edge, no date. */
export function buckets(list: Array<number | null>, edges: number[]): number[] {
  const out = new Array<number>(edges.length + 2).fill(0);
  for (const age of list) {
    if (age === null) {
      out[out.length - 1]++;
      continue;
    }
    const i = edges.findIndex((x) => age <= x);
    out[i < 0 ? edges.length : i]++;
  }
  return out;
}

export type PipelineRow = {
  key: string;
  id?: string;
  jobNo: string;
  poDate: string;
  supplier: string | null;
  customer: string | null;
  demandPoc: string | null;
  product: string | null;
  qty: number | null;
  cxQuote: string;
  sxReady: string;
  /** A date (YYYY-MM-DD) or "TBD – <team>". */
  etd: string;
  remarks: string | null;
  holding: number | null;
};

const poRow = (p: Po, day: string): PipelineRow => ({
  key: "po-" + p.id,
  jobNo: p.requestNo === null ? "" : String(p.requestNo),
  poDate: p.poDate,
  supplier: p.supplier,
  customer: p.customer,
  demandPoc: p.demandPoc,
  product: p.product,
  qty: p.qtyToDispatch ?? p.poQty,
  cxQuote: "",
  sxReady: "",
  etd: `TBD – ${STAGE_TEAM[p.stage] ?? "Demand"}`,
  remarks: p.notes,
  holding: holding(p.poDate, day),
});

const PLAN_COLS = ["n", "before", "tomorrow", "post", "none", "picked"] as const;
const TRANSIT_COLS = ["n", "before", "tomorrow", "post", "none", "delivered"] as const;

export function shipmentReports<R extends Row>({ mis = [], fpo = [], day }: { mis?: R[]; fpo?: Po[]; day: string }) {
  const live = mis.filter((e) => !isCancelled(e));
  const plan = live.filter(isPlanned);
  const transit = live.filter(isTransit);
  const picked = live.filter((e) => e.actualEtd === day && (isTransit(e) || isDelivered(e)));
  const deliveredToday = live.filter((e) => isDelivered(e) && e.actualEta === day);
  const from4 = addDaysIso(day, -3);
  const delivered = live
    .filter((e) => isDelivered(e) && e.actualEta && e.actualEta >= from4)
    .sort((a, b) => a.actualEta.localeCompare(b.actualEta) || byJobAsc(a, b));

  const etaOf = (e: Row) => e.actualEta || e.plannedEta;
  const planPoc = perPoc<(typeof PLAN_COLS)[number]>(
    [
      ...plan.map((e) => ({ e, add: ["n", when(e.actualEtd || e.plannedEtd, day)] as Array<(typeof PLAN_COLS)[number]> })),
      ...picked.map((e) => ({ e, add: ["picked"] as Array<(typeof PLAN_COLS)[number]> })),
    ],
    PLAN_COLS,
  );
  const transitPoc = perPoc<(typeof TRANSIT_COLS)[number]>(
    [
      ...transit.map((e) => ({ e, add: ["n", when(etaOf(e), day)] as Array<(typeof TRANSIT_COLS)[number]> })),
      ...deliveredToday.map((e) => ({ e, add: ["delivered"] as Array<(typeof TRANSIT_COLS)[number]> })),
    ],
    TRANSIT_COLS,
  );

  // Fresh PO pipeline: POs not yet pushed to MIS, plus MIS rows still at "Fresh PO"
  const pipeline: PipelineRow[] = [
    ...fpo.filter((p) => p.board === "FRESH").map((p) => poRow(p, day)),
    ...live.filter(isFreshRow).map((e) => ({
      key: "mis-" + e.id,
      id: e.id,
      jobNo: e.jobNo,
      poDate: e.poDate,
      supplier: e.supplier,
      customer: e.customer,
      demandPoc: e.agDemandPoc,
      product: e.productName,
      qty: e.quantityKgs,
      cxQuote: e.cxQuoteApprovalTime,
      sxReady: e.sxReadinessTime,
      etd: e.actualEtd || e.plannedEtd || "",
      remarks: e.blockersRemarks,
      holding: holding(e.poDate, day),
    })),
  ].sort((a, b) => (b.holding ?? -1) - (a.holding ?? -1) || byJobAsc(a, b));
  const longHold = fpo
    .filter((p) => p.board === "LONG_HOLD")
    .map((p) => poRow(p, day))
    .sort((a, b) => (b.holding ?? -1) - (a.holding ?? -1));

  const dayKey = (v: string) => v || "9";
  return {
    summary: {
      plan: { count: plan.length, ...planPoc },
      transit: { count: transit.length, ...transitPoc },
      pickupX2: plan.length * 2 + transit.length,
      delivered4: delivered.length,
      fresh: { count: pipeline.length, buckets: buckets(pipeline.map((p) => p.holding), [4, 8, 12]) },
      hold: { count: longHold.length, buckets: buckets(longHold.map((p) => p.holding), [7, 14, 21]) },
    },
    upcoming: plan
      .slice()
      .sort((a, b) => dayKey(a.actualEtd || a.plannedEtd).localeCompare(dayKey(b.actualEtd || b.plannedEtd)) || byJobAsc(a, b)),
    transit: transit.slice().sort((a, b) => dayKey(etaOf(a)).localeCompare(dayKey(etaOf(b))) || byJobAsc(a, b)),
    pipeline,
    longHold,
    delivered,
  };
}

export type ShipmentSummary = ReturnType<typeof shipmentReports>["summary"];

/** Days an actual date is later than the planned one (null when either is missing). */
export const lateBy = (planned: string, actual: string) => (planned && actual ? daysBetween(planned, actual) : null);
