import type { MisStatus } from "@/generated/prisma/enums";

/**
 * Picklists shared by Fresh PO, Domestic MIS and the D-0 quotation board.
 * People (Demand POCs, verifiers…) are not listed here: they come from the POC
 * master (OpsPoc) so no names live in code.
 */

export const YES_NO = ["Yes", "No"];
export const CUSTOMER_TYPES = ["AG Warehouse Panoli", "Customer", "Job Worker"];
export const ORIGIN_TYPES = ["Supplier", "Customer", "Warehouse", "Job Worker", "Other"];
export const LOGISTICS_PAYMENT_TERMS = ["AG to Pay", "Customer to Pay", "Godown delivery basis", "AG Customer Split"];
export const LOGISTICS_TYPES = ["AG to Arrange", "Customer to Arrange", "Sx to arrange", "AG to arrange - Cx"];
export const MOVEMENT_TYPES = ["Forward", "Reverse"];
export const BUSINESS_LEGS = ["B2B", "B2C"];
export const PACKAGING = ["25 kg bags", "50 kg bags", "Carboy 50", "Drums", "Loose"];
export const VEHICLE_TYPES = ["Tata Ace", "Eicher 14ft", "Eicher 17ft", "Eicher 19ft", "Container 20ft", "Container 32ft", "Full Truck Load", "Part Load"];
export const TRANSPORT_PAYMENT_STATUS = ["Pending", "Payment Aligned", "Partially Paid", "Paid", "Not Applicable"];

/** Fresh PO document slots. */
export const FRESH_PO_DOC_KINDS = ["PO", "PI", "COA", "MSDS", "OTHER"] as const;
/** Domestic MIS document fields (each holds a list of files). */
export const MIS_DOC_FIELDS = {
  taxInvoice: "Tax Invoice",
  eWayBill: "E-Way Bill",
  coa: "COA",
  transportDoc: "Transport Doc (LR)",
  pod: "POD",
} as const;

export const MIS_STATUS_LABELS: Record<MisStatus, string> = {
  FRESH_PO: "Fresh PO",
  PLANNED: "Planned",
  MATERIAL_READY: "Material Ready",
  INTRANSIT: "In transit",
  DELIVERED: "Delivered",
  ON_HOLD: "On Hold",
  CANCELLED: "Cancelled",
};

const PLACE: Record<string, string> = {
  "ag wh": "Warehouse",
  agwh: "Warehouse",
  "ag warehouse": "Warehouse",
  warehouse: "Warehouse",
  jobworker: "Job Worker",
  "job worker": "Job Worker",
  "job-worker": "Job Worker",
};

/** How sheets write some dropdown values → our lists. */
export const SELECT_ALIASES: Record<string, Record<string, string>> = {
  movementType: { "forward leg": "Forward", "reverse leg": "Reverse" },
  originType: PLACE,
  destinationType: PLACE,
};

export function normalizeSelect(key: string, value: string | null | undefined): string | null | undefined {
  if (!value) return value;
  return SELECT_ALIASES[key]?.[value.trim().toLowerCase()] ?? value;
}

const STATUS_ALIASES: Record<string, MisStatus> = {
  "fresh po": "FRESH_PO",
  planned: "PLANNED",
  "dispatch plan": "PLANNED",
  "dispatch planned": "PLANNED",
  "material ready": "MATERIAL_READY",
  "material readiness": "MATERIAL_READY",
  intransit: "INTRANSIT",
  "in transit": "INTRANSIT",
  "in-transit": "INTRANSIT",
  delivered: "DELIVERED",
  "on hold": "ON_HOLD",
  hold: "ON_HOLD",
  cancelled: "CANCELLED",
  canceled: "CANCELLED",
  cancel: "CANCELLED",
};

/** Sheet / pasted status text → MisStatus, or null when unrecognised. */
export function parseMisStatus(value: string | null | undefined): MisStatus | null {
  if (!value) return null;
  const v = value.trim();
  if (v in MIS_STATUS_LABELS) return v as MisStatus;
  return STATUS_ALIASES[v.toLowerCase()] ?? null;
}

/** Days a Fresh PO may wait before it moves to Long Hold. */
export const LONG_HOLD_DAYS = 15;
