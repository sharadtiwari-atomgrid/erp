/**
 * Fresh PO schema, grouped by the team (phase) that owns each field. Ported
 * from the Domestic B2B CRM's fresh-po/data.js. Safe to import on the client.
 *
 * `req` marks a field required for its phase to be complete; `auto` marks a
 * field the app fills itself (never highlighted as missing).
 */

export type Phase = "demand" | "supply" | "logistics";
export type Stage = "DEMAND_PENDING" | "SUPPLY_PENDING" | "LOGISTICS_PENDING" | "READY";
export type BoardKind = "FRESH" | "LONG_HOLD" | "MIS";
export type Team = "DEMAND" | "SUPPLY" | "LOGISTICS" | "SCM";

export type FieldType =
  | "auto"
  | "customer"
  | "supplier"
  | "product"
  | "poc"
  | "date"
  | "readonly"
  | "number"
  | "computed"
  | "text"
  | "textarea"
  | "enum"
  | "verifier"
  | "autocomplete"
  | "customerPoc"
  | "customerAddress"
  | "supplierPocs"
  | "supplierPickups"
  | "file";

export type OptionList =
  | "YES_NO"
  | "CUSTOMER_TYPES"
  | "LOGISTICS_PAYMENT_TERMS"
  | "LOGISTICS_TYPES"
  | "BUSINESS_LEGS"
  | "ORIGIN_TYPES"
  | "MOVEMENT_TYPES"
  | "PACKAGING";

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  req?: boolean;
  auto?: boolean;
  hint?: string;
  options?: OptionList;
  step?: string;
};

export type SectionDef = { team: string; phase: Phase; fields: FieldDef[] };

export const SECTIONS: SectionDef[] = [
  {
    team: "Demand Team",
    phase: "demand",
    fields: [
      { key: "requestNo", label: "Request No.", type: "auto", auto: true, hint: "Auto-generated · locked" },
      { key: "customer", label: "Customer", type: "customer", req: true },
      { key: "demandPoc", label: "Demand POC AG", type: "poc", req: true },
      { key: "poDate", label: "PO Date", type: "date", req: true },
      { key: "product", label: "Product Name", type: "product", req: true },
      { key: "productType", label: "Product Type", type: "readonly", auto: true, req: true, hint: "From catalog" },
      { key: "poQty", label: "PO Qty (Kg)", type: "number", req: true },
      { key: "qtyToDispatch", label: "Quantity to be dispatched (Kg)", type: "number", req: true },
      { key: "rate", label: "Rate (Rs./Kg)", type: "number", step: "0.1", req: true },
      { key: "totalTaxable", label: "Total Taxable Value (Rs.)", type: "computed", auto: true, req: true, hint: "Qty × Rate" },
      { key: "paymentTerms", label: "Payment Terms", type: "text", req: true },
      { key: "paymentReceived", label: "Payment Received", type: "enum", options: "YES_NO", req: true },
      { key: "customerType", label: "Customer Type", type: "enum", options: "CUSTOMER_TYPES", req: true },
      { key: "customerPoc", label: "Customer POC", type: "customerPoc", req: true },
      { key: "scmContactCustomer", label: "SCM to Contact Customer", type: "enum", options: "YES_NO", req: true },
      { key: "deliveryAddress", label: "Delivery Address", type: "customerAddress", req: true },
      { key: "logisticsPaymentTerm", label: "Logistics Payment Term", type: "enum", options: "LOGISTICS_PAYMENT_TERMS", req: true },
      { key: "cxLogisticsPoc", label: "Cx Logistics POC", type: "text" },
      { key: "logisticsType", label: "Logistics Type", type: "enum", options: "LOGISTICS_TYPES", req: true },
      { key: "scmToDispatch", label: "SCM to Dispatch", type: "enum", options: "YES_NO", req: true },
      { key: "businessLeg", label: "Atomgrid Business Leg", type: "enum", options: "BUSINESS_LEGS", req: true },
      { key: "notes", label: "Notes / Remarks", type: "textarea" },
      { key: "poAttachment", label: "PO Attachment", type: "file", hint: "Saved under Documents → PO" },
    ],
  },
  {
    team: "Supply Team",
    phase: "supply",
    fields: [
      { key: "agSupplyPoc", label: "AG Supply POC", type: "poc", req: true },
      { key: "supplier", label: "Supplier", type: "supplier", req: true },
      { key: "supplyPoc", label: "Supply POC", type: "supplierPocs", req: true },
      { key: "pickupAddress", label: "PickUp Address", type: "supplierPickups", req: true },
      { key: "hsnCode", label: "HSN Code", type: "text", req: true, hint: "Verify vs product catalog" },
      { key: "packaging", label: "Packaging", type: "autocomplete", options: "PACKAGING", req: true },
      { key: "originType", label: "Origin Type", type: "enum", options: "ORIGIN_TYPES", req: true },
      { key: "batchNo", label: "Batch No.", type: "text", hint: "Separate several batches with commas" },
      { key: "coaFile", label: "COA", type: "file", hint: "Saved under Documents → COA" },
    ],
  },
  {
    team: "Logistics Team",
    phase: "logistics",
    fields: [
      { key: "movementType", label: "Movement Type", type: "enum", options: "MOVEMENT_TYPES", req: true },
      { key: "verifiedBy", label: "Details Checked & Verified by", type: "verifier", req: true },
    ],
  },
];

export const ALL_FIELDS: FieldDef[] = SECTIONS.flatMap((s) => s.fields);

/** Which team (phase) owns each field. */
export const FIELD_PHASE: Record<string, Phase> = Object.fromEntries(
  SECTIONS.flatMap((s) => s.fields.map((f) => [f.key, s.phase] as const)),
);

export const DATE_FIELDS = new Set(["poDate"]);
export const NUMBER_FIELDS = new Set(["poQty", "qtyToDispatch", "rate", "totalTaxable"]);

/** Business fields stored on FreshPo (everything a form or a sheet can set). */
export const PO_FIELDS = ALL_FIELDS.filter((f) => f.type !== "file" && f.key !== "requestNo").map((f) => f.key);

export const PHASE_ORDER: Phase[] = ["demand", "supply", "logistics"];

export const PHASES: Record<Phase, { label: string; next: string; nextStage: Stage }> = {
  demand: { label: "Demand Team", next: "Submit to Supply →", nextStage: "SUPPLY_PENDING" },
  supply: { label: "Supply Team", next: "Submit to SCM to process →", nextStage: "LOGISTICS_PENDING" },
  logistics: { label: "Logistics Team", next: "Mark Ready for Operations →", nextStage: "READY" },
};

export const STAGE_ORDER: Stage[] = ["DEMAND_PENDING", "SUPPLY_PENDING", "LOGISTICS_PENDING", "READY"];

export const STAGES: Record<Stage, { label: string; phase: Phase | "ready"; tone: "amber" | "blue" | "violet" | "green" }> = {
  DEMAND_PENDING: { label: "Demand details pending", phase: "demand", tone: "amber" },
  SUPPLY_PENDING: { label: "Supply details pending", phase: "supply", tone: "blue" },
  LOGISTICS_PENDING: { label: "Logistics actions pending", phase: "logistics", tone: "violet" },
  READY: { label: "Ready for Operations", phase: "ready", tone: "green" },
};

export const TEAMS: Team[] = ["DEMAND", "SUPPLY", "LOGISTICS", "SCM"];
export const TEAM_LABELS: Record<Team, string> = { DEMAND: "Demand", SUPPLY: "Supply", LOGISTICS: "Logistics", SCM: "SCM" };
/** The section each team edits; SCM edits all of them. */
export const TEAM_PHASE: Record<Exclude<Team, "SCM">, Phase> = { DEMAND: "demand", SUPPLY: "supply", LOGISTICS: "logistics" };

export function teamCanEdit(team: Team, phase: Phase): boolean {
  return team === "SCM" || TEAM_PHASE[team] === phase;
}

/** The stage a team's "My queue" shows. */
export function queueStage(team: Team): Stage {
  if (team === "SCM") return "READY";
  return `${TEAM_PHASE[team].toUpperCase()}_PENDING` as Stage;
}

export type ColumnDef = { key: string; label: string; w: number; sticky?: boolean; num?: boolean; type?: "date" | "yesno" };

/** Columns shown in the board table. */
export const TABLE_COLUMNS: ColumnDef[] = [
  { key: "requestNo", label: "Request No.", w: 90, sticky: true },
  { key: "customer", label: "Customer", w: 140 },
  { key: "demandPoc", label: "Demand POC AG", w: 110 },
  { key: "poDate", label: "PO Date", w: 90, type: "date" },
  { key: "product", label: "Product Name", w: 190 },
  { key: "productType", label: "Product Type", w: 100 },
  { key: "poQty", label: "PO Qty (Kg)", w: 90, num: true },
  { key: "qtyToDispatch", label: "Qty to Dispatch", w: 100, num: true },
  { key: "rate", label: "Rate (Rs./Kg)", w: 90, num: true },
  { key: "totalTaxable", label: "Total Taxable Value", w: 130, num: true },
  { key: "paymentTerms", label: "Payment Terms", w: 100 },
  { key: "paymentReceived", label: "Payment Received", w: 90, type: "yesno" },
  { key: "customerType", label: "Customer Type", w: 120 },
  { key: "customerPoc", label: "Customer POC", w: 150 },
  { key: "scmContactCustomer", label: "SCM Contact Cx", w: 90, type: "yesno" },
  { key: "deliveryAddress", label: "Delivery Address", w: 220 },
  { key: "logisticsPaymentTerm", label: "Logistics Payment Term", w: 150 },
  { key: "cxLogisticsPoc", label: "Cx Logistics POC", w: 110 },
  { key: "logisticsType", label: "Logistics Type", w: 120 },
  { key: "scmToDispatch", label: "SCM to Dispatch", w: 90, type: "yesno" },
  { key: "businessLeg", label: "Business Leg", w: 90 },
  { key: "agSupplyPoc", label: "AG Supply POC", w: 110 },
  { key: "supplier", label: "Supplier", w: 140 },
  { key: "supplyPoc", label: "Supply POC", w: 150 },
  { key: "pickupAddress", label: "PickUp Address", w: 220 },
  { key: "hsnCode", label: "HSN Code", w: 100 },
  { key: "packaging", label: "Packaging", w: 100 },
  { key: "batchNo", label: "Batch No.", w: 120 },
  { key: "originType", label: "Origin Type", w: 100 },
  { key: "movementType", label: "Movement Type", w: 100 },
  { key: "verifiedBy", label: "Verified by", w: 100 },
  { key: "notes", label: "Notes / Remarks", w: 200 },
];

const EXTRA_LABELS: Record<string, string> = {
  board: "Board",
  stage: "Stage",
  holdReleasedAt: "Back from Long Hold on",
  misJobId: "Domestic MIS job",
};

export function fieldLabel(key: string): string {
  return ALL_FIELDS.find((f) => f.key === key)?.label ?? EXTRA_LABELS[key] ?? key;
}

/** Pasted email labels → field keys (labels lowercased with non-alphanumerics stripped). */
export const PASTE_KEY_MAP: Record<string, string> = {
  jobno: "requestNo",
  requestno: "requestNo",
  customer: "customer",
  demandpocag: "demandPoc",
  podate: "poDate",
  productname: "product",
  producttype: "productType",
  poqty: "poQty",
  quantitytobedispatched: "qtyToDispatch",
  raterskg: "rate",
  totaltaxablevalue: "totalTaxable",
  paymentterms: "paymentTerms",
  paymentreceived: "paymentReceived",
  customertype: "customerType",
  customerpoc: "customerPoc",
  scmteamtocontactcustomer: "scmContactCustomer",
  scmtocontactcustomer: "scmContactCustomer",
  deliveryaddress: "deliveryAddress",
  logisticspaymentterm: "logisticsPaymentTerm",
  cxlogisticspoc: "cxLogisticsPoc",
  logisticstype: "logisticsType",
  scmtodispatch: "scmToDispatch",
  atomgridbusinessleg: "businessLeg",
  notesremarks: "notes",
  hsncode: "hsnCode",
  hscode: "hsnCode",
  packaging: "packaging",
  supplier: "supplier",
  supplypoc: "supplyPoc",
  pickupaddress: "pickupAddress",
  agsupplypoc: "agSupplyPoc",
  origintype: "originType",
  movementtype: "movementType",
};

/** Lowercase alphanumerics only, for matching labels and names. */
export const normKey = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
