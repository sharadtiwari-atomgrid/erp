import type { MisStatus } from "@/generated/prisma/enums";
import { MIS_DOC_FIELDS, MIS_STATUS_LABELS } from "@/lib/ops/lists";
import { isoFromDay } from "@/lib/ops/dates";

/**
 * Plain, serialisable shapes of Domestic MIS jobs and Fresh POs used by the
 * Today page, the dashboard, the views and the daily digest. Day-only dates are
 * YYYY-MM-DD ("" when blank), times are ISO strings, Decimals are numbers.
 * Safe to import on the client.
 */

export type DocField = keyof typeof MIS_DOC_FIELDS;
export const DOC_FIELDS = Object.keys(MIS_DOC_FIELDS) as DocField[];

export type MisRow = {
  id: string;
  jobNo: string;
  status: MisStatus | null;
  poDate: string;
  supplier: string | null;
  customer: string | null;
  productName: string | null;
  quantityKgs: number | null;
  batchNo: string | null;
  grossWtKg: number | null;
  packing: string | null;
  unitCount: string | null;
  hsCode: string | null;
  plannedEtd: string;
  plannedEta: string;
  cxQuoteApprovalTime: string;
  sxReadinessTime: string;
  actualEtd: string;
  actualEta: string;
  logisticsPoc: string | null;
  agSupplyPoc: string | null;
  agDemandPoc: string | null;
  supplyPoc: string | null;
  customerPocDetails: string | null;
  pickupAddress: string | null;
  pickupPincode: string | null;
  dropAddress: string | null;
  dropPincode: string | null;
  logisticsType: string | null;
  vehicleType: string | null;
  transporterDetails: string | null;
  totalLogisticsCost: number | null;
  logisticsCostAgToPay: number | null;
  logisticsPaymentTerm: string | null;
  originType: string | null;
  destinationType: string | null;
  distanceApprox: number | null;
  movementType: string | null;
  taxableValue: number | null;
  taxInvoiceMonth: string | null;
  taxInvoicedDate: string;
  transportPaymentStatus: string | null;
  transportPaidSoFar: number | null;
  transportPaidOn: string;
  transportPaymentRef: string | null;
  blockersRemarks: string | null;
  /** File names per document field (from OpsFile). */
  docs: Record<DocField, string[]>;
};

export type FpoRow = {
  id: string;
  requestNo: number | null;
  board: "FRESH" | "LONG_HOLD" | "MIS";
  stage: "DEMAND_PENDING" | "SUPPLY_PENDING" | "LOGISTICS_PENDING" | "READY";
  customer: string | null;
  supplier: string | null;
  product: string | null;
  demandPoc: string | null;
  poDate: string;
  poQty: number | null;
  qtyToDispatch: number | null;
  notes: string | null;
  createdAt: string;
};

/** An empty row (column headers, tests). */
export function blankMisRow(over: Partial<MisRow> = {}): MisRow {
  const text = null;
  return {
    id: "",
    jobNo: "",
    status: null,
    poDate: "",
    supplier: text,
    customer: text,
    productName: text,
    quantityKgs: null,
    batchNo: text,
    grossWtKg: null,
    packing: text,
    unitCount: text,
    hsCode: text,
    plannedEtd: "",
    plannedEta: "",
    cxQuoteApprovalTime: "",
    sxReadinessTime: "",
    actualEtd: "",
    actualEta: "",
    logisticsPoc: text,
    agSupplyPoc: text,
    agDemandPoc: text,
    supplyPoc: text,
    customerPocDetails: text,
    pickupAddress: text,
    pickupPincode: text,
    dropAddress: text,
    dropPincode: text,
    logisticsType: text,
    vehicleType: text,
    transporterDetails: text,
    totalLogisticsCost: null,
    logisticsCostAgToPay: null,
    logisticsPaymentTerm: text,
    originType: text,
    destinationType: text,
    distanceApprox: null,
    movementType: text,
    taxableValue: null,
    taxInvoiceMonth: text,
    taxInvoicedDate: "",
    transportPaymentStatus: text,
    transportPaidSoFar: null,
    transportPaidOn: "",
    transportPaymentRef: text,
    blockersRemarks: text,
    docs: { taxInvoice: [], eWayBill: [], coa: [], transportDoc: [], pod: [] },
    ...over,
  };
}

type Dec = { toString(): string } | number | null | undefined;
const n = (v: Dec): number | null => {
  if (v === null || v === undefined) return null;
  const x = Number(v.toString());
  return Number.isFinite(x) ? x : null;
};
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : "");

/** Prisma MisJob (+ its OpsFile rows) → MisRow. */
export function toMisRow(
  j: {
    id: string;
    jobNo: string;
    status: MisStatus | null;
    poDate: Date | null;
    quantityKgs: Dec;
    grossWtKg: Dec;
    plannedEtd: Date | null;
    plannedEta: Date | null;
    cxQuoteApprovalTime: Date | null;
    sxReadinessTime: Date | null;
    actualEtd: Date | null;
    actualEta: Date | null;
    totalLogisticsCost: Dec;
    logisticsCostAgToPay: Dec;
    distanceApprox: Dec;
    taxableValue: Dec;
    taxInvoicedDate: Date | null;
    transportPaidSoFar: Dec;
    transportPaidOn: Date | null;
  } & Record<string, unknown>,
  files: Array<{ field: string; fileName: string }> = [],
): MisRow {
  const docs = Object.fromEntries(DOC_FIELDS.map((f) => [f, [] as string[]])) as Record<DocField, string[]>;
  for (const f of files) if (f.field in docs) docs[f.field as DocField].push(f.fileName);
  const s = (k: string) => (typeof j[k] === "string" && (j[k] as string) !== "" ? (j[k] as string) : null);
  return {
    id: j.id,
    jobNo: j.jobNo,
    status: j.status,
    poDate: isoFromDay(j.poDate),
    supplier: s("supplier"),
    customer: s("customer"),
    productName: s("productName"),
    quantityKgs: n(j.quantityKgs),
    batchNo: s("batchNo"),
    grossWtKg: n(j.grossWtKg),
    packing: s("packing"),
    unitCount: s("unitCount"),
    hsCode: s("hsCode"),
    plannedEtd: isoFromDay(j.plannedEtd),
    plannedEta: isoFromDay(j.plannedEta),
    cxQuoteApprovalTime: iso(j.cxQuoteApprovalTime),
    sxReadinessTime: iso(j.sxReadinessTime),
    actualEtd: isoFromDay(j.actualEtd),
    actualEta: isoFromDay(j.actualEta),
    logisticsPoc: s("logisticsPoc"),
    agSupplyPoc: s("agSupplyPoc"),
    agDemandPoc: s("agDemandPoc"),
    supplyPoc: s("supplyPoc"),
    customerPocDetails: s("customerPocDetails"),
    pickupAddress: s("pickupAddress"),
    pickupPincode: s("pickupPincode"),
    dropAddress: s("dropAddress"),
    dropPincode: s("dropPincode"),
    logisticsType: s("logisticsType"),
    vehicleType: s("vehicleType"),
    transporterDetails: s("transporterDetails"),
    totalLogisticsCost: n(j.totalLogisticsCost),
    logisticsCostAgToPay: n(j.logisticsCostAgToPay),
    logisticsPaymentTerm: s("logisticsPaymentTerm"),
    originType: s("originType"),
    destinationType: s("destinationType"),
    distanceApprox: n(j.distanceApprox),
    movementType: s("movementType"),
    taxableValue: n(j.taxableValue),
    taxInvoiceMonth: s("taxInvoiceMonth"),
    taxInvoicedDate: isoFromDay(j.taxInvoicedDate),
    transportPaymentStatus: s("transportPaymentStatus"),
    transportPaidSoFar: n(j.transportPaidSoFar),
    transportPaidOn: isoFromDay(j.transportPaidOn),
    transportPaymentRef: s("transportPaymentRef"),
    blockersRemarks: s("blockersRemarks"),
    docs,
  };
}

export function toFpoRow(p: {
  id: string;
  requestNo: number | null;
  board: FpoRow["board"];
  stage: FpoRow["stage"];
  customer: string | null;
  supplier: string | null;
  product: string | null;
  demandPoc: string | null;
  poDate: Date | null;
  poQty: Dec;
  qtyToDispatch: Dec;
  notes: string | null;
  createdAt: Date;
}): FpoRow {
  return {
    id: p.id,
    requestNo: p.requestNo,
    board: p.board,
    stage: p.stage,
    customer: p.customer,
    supplier: p.supplier,
    product: p.product,
    demandPoc: p.demandPoc,
    poDate: isoFromDay(p.poDate),
    poQty: n(p.poQty),
    qtyToDispatch: n(p.qtyToDispatch),
    notes: p.notes,
    createdAt: p.createdAt.toISOString(),
  };
}

/* ---------------- status predicates (the source matched status text) ---------------- */

export const isCancelled = (e: Pick<MisRow, "status">) => e.status === "CANCELLED";
export const isDelivered = (e: Pick<MisRow, "status">) => e.status === "DELIVERED";
export const isTransit = (e: Pick<MisRow, "status">) => e.status === "INTRANSIT";
export const isHold = (e: Pick<MisRow, "status">) => e.status === "ON_HOLD";
export const isFreshRow = (e: Pick<MisRow, "status">) => e.status === "FRESH_PO";
/** Dispatch plan: "Planned" or "Material Ready". */
export const isDispatchPlan = (e: Pick<MisRow, "status">) => e.status === "PLANNED" || e.status === "MATERIAL_READY";

export const statusLabel = (s: MisStatus | null | undefined) => (s ? MIS_STATUS_LABELS[s] : "—");
export const hasDoc = (e: Pick<MisRow, "docs">, f: DocField) => e.docs[f].length > 0;

/** A day or an ISO date-time → its IST day (YYYY-MM-DD); "" stays "". */
export function istDay(v: string | null | undefined): string {
  if (!v) return "";
  return v.length > 10 ? new Date(new Date(v).getTime() + 330 * 60_000).toISOString().slice(0, 10) : v;
}

/** "YYYY-MM-DD" → "dd/mm/yyyy"; "" stays "". Also accepts ISO date-times (shown as the IST day). */
export function dmy(v: string | null | undefined): string {
  if (!v) return "";
  const day = istDay(v);
  const [y, m, d] = day.split("-");
  return d && m && y ? `${d}/${m}/${y}` : v;
}

/** Numeric job numbers high first, others after. */
export function byJobDesc(a: { jobNo: string }, b: { jobNo: string }) {
  const na = Number.parseInt(a.jobNo.replace(/[^0-9]/g, ""), 10);
  const nb = Number.parseInt(b.jobNo.replace(/[^0-9]/g, ""), 10);
  if (Number.isNaN(na) && Number.isNaN(nb)) return 0;
  if (Number.isNaN(na)) return 1;
  if (Number.isNaN(nb)) return -1;
  return nb - na;
}

/** Job numbers compared as numbers when both are numeric (the digest's byNum). */
export const byJobAsc = (a: { jobNo: string }, b: { jobNo: string }) => (Number(a.jobNo) || 0) - (Number(b.jobNo) || 0);
