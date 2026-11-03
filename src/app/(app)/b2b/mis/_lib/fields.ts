/**
 * Domestic MIS field definitions, grouped into the entry form's sections.
 * A row is handled as flat strings (dates YYYY-MM-DD, date-times YYYY-MM-DDTHH:mm in IST,
 * months YYYY-MM, numbers as typed); documents live separately (see files.ts).
 * Pure: safe on the client, the server and in tests.
 */
import type { MisStatus } from "@/generated/prisma/enums";
import {
  LOGISTICS_PAYMENT_TERMS,
  LOGISTICS_TYPES,
  MIS_DOC_FIELDS,
  MIS_STATUS_LABELS,
  MOVEMENT_TYPES,
  ORIGIN_TYPES,
  PACKAGING,
  TRANSPORT_PAYMENT_STATUS,
  VEHICLE_TYPES,
} from "@/lib/ops/lists";
import { daysBetween } from "@/lib/ops/dates";

export type FieldType =
  | "text"
  | "number"
  | "date"
  | "month"
  | "datetime"
  | "textarea"
  | "select"
  | "master"
  | "poc"
  | "batch"
  | "file"
  | "computed";

export type MasterList = "customers" | "suppliers" | "products";

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  /** Select: options; master: which master list. */
  options?: readonly string[];
  master?: MasterList;
  hint?: string;
  placeholder?: string;
  numeric?: boolean;
};

export type DocKey = keyof typeof MIS_DOC_FIELDS;
export const DOC_KEYS = Object.keys(MIS_DOC_FIELDS) as DocKey[];

export const STATUS_KEYS = Object.keys(MIS_STATUS_LABELS) as MisStatus[];

export const OPTIONS: Record<string, readonly string[]> = {
  status: STATUS_KEYS,
  packing: PACKAGING,
  logisticsType: LOGISTICS_TYPES,
  vehicleType: VEHICLE_TYPES,
  logisticsPaymentTerm: LOGISTICS_PAYMENT_TERMS,
  originType: ORIGIN_TYPES,
  destinationType: ORIGIN_TYPES,
  transportPaymentStatus: TRANSPORT_PAYMENT_STATUS,
  movementType: MOVEMENT_TYPES,
};

const sel = (key: string, label: string, hint?: string): FieldDef => ({ key, label, type: "select", options: OPTIONS[key], hint });
const doc = (key: DocKey): FieldDef => ({ key, label: MIS_DOC_FIELDS[key], type: "file" });

export const SECTIONS: Array<{ title: string; fields: FieldDef[] }> = [
  {
    title: "Identification",
    fields: [
      { key: "jobNo", label: "Job No.", type: "text", hint: "Next number after the last job for new entries; jobs from Fresh PO keep theirs" },
      { key: "poDate", label: "PO Date", type: "date" },
      { key: "supplier", label: "Supplier", type: "master", master: "suppliers" },
      { key: "customer", label: "Customer", type: "master", master: "customers" },
      { key: "productName", label: "Product Name", type: "master", master: "products" },
      sel("status", "Status"),
    ],
  },
  {
    title: "Product & Quantity",
    fields: [
      { key: "quantityKgs", label: "Quantity (in KGS)", type: "number" },
      { key: "batchNo", label: "Batch No.", type: "batch", hint: "Pick from the batches in stock (comma-separated for more than one)" },
      { key: "grossWtKg", label: "Gross Wt (Kg)", type: "number" },
      sel("packing", "Packing"),
      { key: "unitCount", label: "No. of Units", type: "number", hint: "Bags / drums / boxes in this shipment" },
      { key: "hsCode", label: "HS Code", type: "text" },
    ],
  },
  {
    title: "Schedule",
    fields: [
      { key: "plannedEtd", label: "Planned ETD (Fixed)", type: "date" },
      { key: "plannedEta", label: "Planned ETA (Fixed)", type: "date" },
      { key: "cxQuoteApprovalTime", label: "Cx Quote approval time", type: "datetime" },
      { key: "sxReadinessTime", label: "Sx Material readiness confirmation time", type: "datetime" },
      { key: "actualEtd", label: "Actual / Tentative ETD", type: "date" },
      { key: "actualEta", label: "Actual / Tentative ETA", type: "date" },
      { key: "etdMinusPoDate", label: "ETD - PO Date (days)", type: "computed", placeholder: "auto (Planned ETD − PO Date)" },
    ],
  },
  {
    title: "POCs",
    fields: [
      { key: "logisticsPoc", label: "Logistics PoC", type: "poc" },
      { key: "agSupplyPoc", label: "AG Supply POC", type: "poc" },
      { key: "agDemandPoc", label: "AG Demand POC", type: "poc" },
      { key: "supplyPoc", label: "Supply POC", type: "poc" },
      { key: "customerPocDetails", label: "Customer POC details", type: "text" },
    ],
  },
  {
    title: "Addresses",
    fields: [
      { key: "pickupAddress", label: "PickUp Address", type: "textarea" },
      { key: "pickupPincode", label: "PickUp Pincode", type: "text", numeric: true },
      { key: "dropAddress", label: "Drop Address", type: "textarea" },
      { key: "dropPincode", label: "Drop Pincode", type: "text", numeric: true },
    ],
  },
  {
    title: "Logistics",
    fields: [
      sel("logisticsType", "Logistics Type"),
      sel("vehicleType", "Vehicle type"),
      { key: "transporterDetails", label: "Transporter Details", type: "text" },
      { key: "totalLogisticsCost", label: "Total Logistics Cost", type: "number" },
      { key: "logisticsCostAgToPay", label: "Logistics Cost (AG to Pay)", type: "number" },
      sel("logisticsPaymentTerm", "Logistics Payment term"),
      sel("originType", "Origin type"),
      sel("destinationType", "Destination type"),
      { key: "transitTimeDays", label: "Transit Time (days)", type: "computed", placeholder: "auto (Actual ETA − Actual ETD)" },
      { key: "distanceApprox", label: "Distance (Aprox) km", type: "number", hint: "Filled from the PickUp → Drop pincodes when blank; editable" },
      sel("movementType", "Movement Type"),
    ],
  },
  {
    title: "Commercials & Tax",
    fields: [
      { key: "taxableValue", label: "Taxable value (Rs.)", type: "number" },
      { key: "taxInvoiceMonth", label: "Tax Invoice Month", type: "month" },
      doc("taxInvoice"),
      { key: "taxInvoicedDate", label: "Tax Invoiced Date", type: "date" },
    ],
  },
  {
    title: "Documents",
    fields: [
      doc("eWayBill"),
      doc("coa"),
      doc("transportDoc"),
      doc("pod"),
      sel("transportPaymentStatus", "Transport Payment Status"),
      { key: "transportPaidSoFar", label: "Transport Paid So Far (Rs.)", type: "number", hint: "For Partially Paid: what has gone out; Payables shows the rest as owed" },
      { key: "transportPaidOn", label: "Transport Paid On", type: "date", hint: "Needed to mark the transport payment Paid" },
      { key: "transportPaymentRef", label: "Transport Payment Ref (UTR)", type: "text", hint: "UTR / cheque no.: needed to mark it Paid" },
    ],
  },
  {
    title: "Tracking & Remarks",
    fields: [{ key: "blockersRemarks", label: "Blockers and remarks (In case of delayed)", type: "textarea" }],
  },
];

/** Every field in form order. */
export const ALL_FIELDS: FieldDef[] = SECTIONS.flatMap((s) => s.fields);
/** Import-only fields kept on the row but not shown in the form. */
export const EXTRA_FIELDS: FieldDef[] = [
  { key: "planningActionables", label: "Planning - Actionables", type: "text" },
  { key: "cxSxAlignmentTime", label: "Cx Sx alignment to dispatch time", type: "text" },
  { key: "statusConfirmedDate", label: "Status Confirmed Date", type: "text" },
];

export const FIELD_BY_KEY: Record<string, FieldDef> = Object.fromEntries(
  [...ALL_FIELDS, ...EXTRA_FIELDS].map((f) => [f.key, f]),
);

/** Scalar (stored) fields: everything except files and computed values. */
export const VALUE_FIELDS: FieldDef[] = [...ALL_FIELDS, ...EXTRA_FIELDS].filter((f) => f.type !== "file" && f.type !== "computed");
export const VALUE_KEYS = VALUE_FIELDS.map((f) => f.key);
export const POC_KEYS = ALL_FIELDS.filter((f) => f.type === "poc").map((f) => f.key);

export type MisValues = Record<string, string>;

export const labelOf = (key: string) => FIELD_BY_KEY[key]?.label ?? key;

/** "In transit" for INTRANSIT; other text as is. */
export function statusLabel(status: string | null | undefined): string {
  if (!status) return "";
  return MIS_STATUS_LABELS[status as MisStatus] ?? status;
}

/** Display text for one value of a field (status label, dd/mm/yyyy dates…). */
export function optionLabel(key: string, value: string) {
  return key === "status" ? statusLabel(value) : value;
}

export function blankValues(): MisValues {
  return Object.fromEntries(VALUE_KEYS.map((k) => [k, ""]));
}

const str = (v: number | null) => (v === null ? "" : String(v));

/** ETD − PO Date in whole days (Planned ETD minus PO Date). */
export function etdMinusPoDate(r: MisValues): string {
  return r.poDate && r.plannedEtd ? str(daysBetween(r.poDate.slice(0, 10), r.plannedEtd.slice(0, 10))) : "";
}

/** Transit time in days: Actual ETA − Actual ETD, blank until the ETA is set. */
export function transitDays(r: MisValues): string {
  if (!r.actualEta || !r.actualEtd) return "";
  return str(daysBetween(r.actualEtd.slice(0, 10), r.actualEta.slice(0, 10)));
}

export function computed(r: MisValues) {
  return { etdMinusPoDate: etdMinusPoDate(r), transitTimeDays: transitDays(r) };
}

/** A row is worth saving once it names a customer, product or supplier. */
export const hasContent = (r: MisValues) => ["customer", "productName", "supplier"].some((k) => String(r[k] ?? "").trim() !== "");
