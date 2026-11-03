/**
 * D-0 quotation board rules, ported from the source's quotation-sheet/page.js.
 * Pure (no database), so the server, the client grid and the tests share them.
 */

export const VEHICLE_STATUS = [
  "Quotation Approved",
  "Transporter Aligned",
  "Vehicle Details Received",
  "Vehicle reached",
  "Loaded",
  "Dispatched",
  "Documents Shared",
] as const;

export const VEHICLE_TYPES = ["Closed vehicle", "Vehicle with tarpoline"] as const;

export const TX_SLOTS = ["Tx1", "Tx2", "Tx3", "Tx4"] as const;
export type TxSlot = (typeof TX_SLOTS)[number];

export type Bid = { name: string; quote: string; tat: string; remarks: string };
export const blankBid = (): Bid => ({ name: "", quote: "", tat: "", remarks: "" });

/** The stored `bids` JSON → always four bids. */
export function normalizeBids(raw: unknown): Bid[] {
  const list = Array.isArray(raw) ? raw : [];
  return TX_SLOTS.map((_, i) => {
    const b = (list[i] ?? {}) as Record<string, unknown>;
    const s = (k: string) => (typeof b[k] === "string" ? (b[k] as string) : b[k] === null || b[k] === undefined ? "" : String(b[k]));
    return { name: s("name"), quote: s("quote"), tat: s("tat"), remarks: s("remarks") };
  });
}

/** Text cells the board fills from the MIS job (the source's `fromMis`). */
export const MIS_FILLED = [
  "distance",
  "supplier",
  "pickupAddress",
  "customer",
  "deliveryAddress",
  "netWeight",
  "grossWt",
  "packing",
  "taxableValue",
  "paymentTerms",
  "agDemandPoc",
  "vehicleArrangements",
  "vehicleType",
] as const;
export type MisFilled = (typeof MIS_FILLED)[number];

type Num = number | string | { toString(): string } | null | undefined;
export type MisSource = {
  distanceApprox?: Num;
  supplier?: string | null;
  pickupAddress?: string | null;
  pickupPincode?: string | null;
  customer?: string | null;
  dropAddress?: string | null;
  dropPincode?: string | null;
  quantityKgs?: Num;
  grossWtKg?: Num;
  packing?: string | null;
  taxableValue?: Num;
  logisticsPaymentTerm?: string | null;
  agDemandPoc?: string | null;
  logisticsType?: string | null;
  transporterDetails?: string | null;
  vehicleType?: string | null;
};

const str = (v: Num | string) => (v === null || v === undefined ? "" : String(v).trim());
export const withPin = (addr: string | null | undefined, pin: string | null | undefined) =>
  [addr, pin]
    .map((s) => str(s))
    .filter(Boolean)
    .join(" - ");

/** MIS job → the board's cells. */
export function fromMis(m: MisSource): Record<MisFilled, string> {
  return {
    distance: str(m.distanceApprox),
    supplier: str(m.supplier),
    pickupAddress: withPin(m.pickupAddress, m.pickupPincode),
    customer: str(m.customer),
    deliveryAddress: withPin(m.dropAddress, m.dropPincode),
    netWeight: str(m.quantityKgs),
    grossWt: str(m.grossWtKg),
    packing: str(m.packing),
    taxableValue: str(m.taxableValue),
    paymentTerms: str(m.logisticsPaymentTerm),
    agDemandPoc: str(m.agDemandPoc),
    vehicleArrangements: str(m.logisticsType) || str(m.transporterDetails),
    vehicleType: str(m.vehicleType),
  };
}

/** Blank cells of a board row filled from the MIS job; anything already typed is kept. */
export function backfill(row: Partial<Record<MisFilled, string | null>>, m: MisSource): Partial<Record<MisFilled, string>> {
  const src = fromMis(m);
  const patch: Partial<Record<MisFilled, string>> = {};
  for (const k of MIS_FILLED) if (src[k] && !str(row[k])) patch[k] = src[k];
  return patch;
}

/**
 * Vehicle stepper: ticking a step completes it and every earlier step; unticking
 * clears it and everything after. vehicleStatus = the last completed step.
 */
export function toggleStage(stages: readonly string[], i: number): { vehicleStages: string[]; vehicleStatus: string } {
  const done = new Set(stages);
  const step = VEHICLE_STATUS[i];
  if (done.has(step)) for (let j = i; j < VEHICLE_STATUS.length; j++) done.delete(VEHICLE_STATUS[j]);
  else for (let j = 0; j <= i; j++) done.add(VEHICLE_STATUS[j]);
  const list: string[] = VEHICLE_STATUS.filter((s) => done.has(s));
  return { vehicleStages: list, vehicleStatus: list.at(-1) ?? "" };
}

/** Completed steps for a stored row (older rows only had vehicleStatus). */
export function stagesOf(row: { vehicleStages?: string[] | null; vehicleStatus?: string | null }): string[] {
  if (row.vehicleStages?.length) return VEHICLE_STATUS.filter((s) => row.vehicleStages!.includes(s));
  const i = VEHICLE_STATUS.indexOf((row.vehicleStatus ?? "") as (typeof VEHICLE_STATUS)[number]);
  return i < 0 ? [] : VEHICLE_STATUS.slice(0, i + 1);
}

export type ApprovalPatch = { transporterDetails?: string; totalLogisticsCost?: number; logisticsCostAgToPay?: number };

/** Digits of a quote ("₹ 12,500/-" → 12500), null when there are none. */
export function quoteAmount(q: string | null | undefined): number | null {
  const digits = String(q ?? "").replace(/[^0-9.]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

/**
 * What approving a bid writes to the MIS job: the transporter, the total cost and,
 * when the payment term is "AG to pay" and AG-to-pay is blank, that too.
 */
export function approvalPatch(
  bid: Bid,
  m: { logisticsPaymentTerm?: string | null; logisticsCostAgToPay?: Num },
): ApprovalPatch {
  const patch: ApprovalPatch = {};
  if (bid.name.trim()) patch.transporterDetails = bid.name.trim();
  const cost = quoteAmount(bid.quote);
  if (cost !== null) {
    patch.totalLogisticsCost = cost;
    if (/ag to pay/i.test(m.logisticsPaymentTerm ?? "") && !str(m.logisticsCostAgToPay)) patch.logisticsCostAgToPay = cost;
  }
  return patch;
}

/** MIS fields the patch would overwrite with a different value: [field, current]. */
export function approvalClashes(
  patch: ApprovalPatch,
  m: { transporterDetails?: string | null; totalLogisticsCost?: Num; logisticsCostAgToPay?: Num },
): Array<[keyof ApprovalPatch, string]> {
  const out: Array<[keyof ApprovalPatch, string]> = [];
  for (const [k, v] of Object.entries(patch) as Array<[keyof ApprovalPatch, string | number]>) {
    const cur = str(m[k]);
    if (!cur) continue;
    const same = typeof v === "number" ? Number(cur) === v : cur === v;
    if (!same) out.push([k, cur]);
  }
  return out;
}

/** Search over job, customer, supplier and the transporters quoted. */
export function matchesSearch(row: { jobNo: string; customer?: string | null; supplier?: string | null; bids: Bid[] }, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [row.jobNo, row.customer, row.supplier, ...row.bids.map((b) => b.name)].some((v) => (v ?? "").toLowerCase().includes(s));
}
