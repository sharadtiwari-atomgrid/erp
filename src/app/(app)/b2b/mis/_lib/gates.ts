/**
 * Status gates: what must be filled before a shipment can move into In transit or
 * Delivered, or have its transport payment marked Paid. Checked only when the row
 * is moving INTO that step, so editing an old row that is already In transit is
 * never blocked. Shared by the form and the server actions. Pure.
 */
import type { MisValues } from "./fields";

export type Step = "Intransit" | "Delivered" | "Paid";
export type Problem = { step: Step; key: string; label: string; why: string };

const filled = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== "";
const isTransit = (s: unknown) => s === "INTRANSIT";
const isDelivered = (s: unknown) => s === "DELIVERED";
const isPaid = (s: unknown) => /^paid$/i.test(String(s ?? "").trim());

const SHIP: Array<[string, string, string]> = [
  ["actualEtd", "Actual / Tentative ETD", "the dispatch date"],
  ["transporterDetails", "Transporter Details", "who is carrying it"],
  ["quantityKgs", "Quantity (in KGS)", "the quantity sent"],
  ["batchNo", "Batch No.", "the batch(es) sent"],
];

/** What each gated step needs: [field key, label, why]. */
export const GATES: Record<Step, Array<[string, string, string]>> = {
  Intransit: SHIP,
  Delivered: [...SHIP, ["actualEta", "Actual / Tentative ETA", "the delivery date"]],
  Paid: [
    ["transportPaidOn", "Transport Paid On", "the payment date"],
    ["transportPaymentRef", "Transport Payment Ref (UTR)", "the payment reference"],
  ],
};

/** What's missing to make this change. `prev` is the row as saved (null for a new row). */
export function statusProblems(next: Partial<MisValues>, prev: Partial<MisValues> | null | undefined): Problem[] {
  const out: Problem[] = [];
  const check = (step: Step) => {
    for (const [key, label, why] of GATES[step]) if (!filled(next[key])) out.push({ step, key, label, why });
  };
  if (isDelivered(next.status) && !isDelivered(prev?.status)) check("Delivered");
  else if (isTransit(next.status) && !isTransit(prev?.status) && !isDelivered(prev?.status)) check("Intransit");
  if (isPaid(next.transportPaymentStatus) && !isPaid(prev?.transportPaymentStatus)) check("Paid");
  return out;
}

export const STEP_LABEL: Record<Step, string> = { Intransit: "In transit", Delivered: "Delivered", Paid: "Paid" };
const STEP_DOING: Record<Step, string> = {
  Intransit: "marking it In transit",
  Delivered: "marking it Delivered",
  Paid: "marking the transport payment Paid",
};

/** "Before marking it Delivered, fill: Actual / Tentative ETA, Batch No." */
export function problemText(list: Problem[]): string {
  const by: Partial<Record<Step, string[]>> = {};
  for (const p of list) (by[p.step] ||= []).push(p.label);
  return Object.entries(by)
    .map(([s, ls]) => `Before ${STEP_DOING[s as Step]}, fill: ${ls!.join(", ").replace(/\.$/, "")}.`)
    .join(" ");
}

/**
 * The row as it may be saved: a gated status / payment change keeps the previous
 * value until its fields are filled; everything else goes through.
 */
export function holdGated<T extends Partial<MisValues>>(next: T, prev: Partial<MisValues> | null | undefined): { row: T; problems: Problem[] } {
  const problems = statusProblems(next, prev);
  if (!problems.length) return { row: next, problems };
  const row = { ...next };
  if (problems.some((p) => p.step !== "Paid")) (row as MisValues).status = prev?.status ?? "";
  if (problems.some((p) => p.step === "Paid")) (row as MisValues).transportPaymentStatus = prev?.transportPaymentStatus ?? "";
  return { row, problems };
}

/**
 * Uploading the first document of a kind moves the status on: the POD means it has
 * arrived (Delivered), the E-Way Bill means it has left (In transit).
 * Returns the status to move to, or null.
 */
export function docStatus(field: string, status: string | null | undefined, hadFiles: boolean): "DELIVERED" | "INTRANSIT" | null {
  if (hadFiles) return null;
  const s = status ?? "";
  if (field === "pod" && s !== "DELIVERED" && s !== "CANCELLED") return "DELIVERED";
  if (field === "eWayBill" && ["", "FRESH_PO", "PLANNED", "MATERIAL_READY", "ON_HOLD"].includes(s)) return "INTRANSIT";
  return null;
}
