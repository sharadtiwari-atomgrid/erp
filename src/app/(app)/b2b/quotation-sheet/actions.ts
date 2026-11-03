"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { diff, recordChange } from "@/lib/audit";
import { db } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import { TX_SLOTS, VEHICLE_STATUS, approvalClashes, approvalPatch, normalizeBids } from "./_lib/board";

const text = z.string().max(2000).transform((v) => (v.trim() ? v : null));
const PatchSchema = z
  .object({
    distance: text,
    supplier: text,
    pickupAddress: text,
    customer: text,
    deliveryAddress: text,
    netWeight: text,
    grossWt: text,
    packing: text,
    taxableValue: text,
    paymentTerms: text,
    agDemandPoc: text,
    materialReadiness: z.enum(["", "Yes", "No"]).transform((v) => v || null),
    materialReadyTime: text,
    vehicleStatus: z.union([z.literal(""), z.enum(VEHICLE_STATUS)]).transform((v) => v || null),
    vehicleStages: z.array(z.enum(VEHICLE_STATUS)),
    vehicleArrangements: text,
    vehicleDetails: text,
    vehicleType: text,
    bids: z
      .array(z.object({ name: z.string().max(300), quote: z.string().max(100), tat: z.string().max(100), remarks: z.string().max(1000) }))
      .length(TX_SLOTS.length),
  })
  .partial()
  .strict();

export type QuotePatch = z.input<typeof PatchSchema>;
export type SaveResult = { ok: true } | { ok: false; error: string };

/** Autosaved cell edits on one board row. */
export async function saveQuote(id: string, patch: QuotePatch): Promise<SaveResult> {
  const user = await requireUser("b2bOrders", "edit");
  const parsed = PatchSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid change." };
  const before = await db.dispatchQuote.findUnique({ where: { id } });
  if (!before) return { ok: false, error: "This row no longer exists. Reload the page." };
  const after = await db.dispatchQuote.update({ where: { id }, data: parsed.data });
  await recordChange({
    userId: user.id,
    entityType: "DispatchQuote",
    entityId: id,
    action: "updated",
    message: `D-0 quotation for job ${after.jobNo} updated`,
    changes: diff(before, after),
  });
  return { ok: true };
}

export type ApproveResult =
  | { ok: true; note: string }
  | { ok: false; error: string }
  /** The MIS job already holds different values: ask, then call again with replace = true. */
  | { ok: false; confirm: string };

/**
 * Approves bid `slot` ("" un-approves). Approving books the transporter and the
 * quote on the Domestic MIS job; values already there that differ are only
 * replaced when `replace` is true.
 */
export async function approveQuote(id: string, slot: string, replace = false): Promise<ApproveResult> {
  const user = await requireUser("b2bOrders", "edit");
  if (slot && !(TX_SLOTS as readonly string[]).includes(slot)) return { ok: false, error: "Unknown quote." };
  const row = await db.dispatchQuote.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "This row no longer exists. Reload the page." };

  if ((row.approvedTx ?? "") !== slot) {
    const after = await db.dispatchQuote.update({ where: { id }, data: { approvedTx: slot || null } });
    await recordChange({
      userId: user.id,
      entityType: "DispatchQuote",
      entityId: id,
      action: "updated",
      message: slot ? `D-0 quotation for job ${row.jobNo}: ${slot} approved` : `D-0 quotation for job ${row.jobNo}: approval removed`,
      changes: diff(row, after),
    });
  }
  revalidatePath("/b2b/quotation-sheet");
  if (!slot) return { ok: true, note: "" };

  const bid = normalizeBids(row.bids)[TX_SLOTS.indexOf(slot as (typeof TX_SLOTS)[number])];
  const label = bid.name || slot;
  const job = await db.misJob.findFirst({ where: { jobNo: row.jobNo, deletedAt: null }, orderBy: { createdAt: "desc" } });
  if (!job) return { ok: true, note: `Approved ${label}. No Domestic MIS job ${row.jobNo} found to update.` };

  const patch = approvalPatch(bid, job);
  if (!Object.keys(patch).length) return { ok: true, note: `Approved ${label}.` };
  const clash = approvalClashes(patch, job);
  const cost = patch.totalLogisticsCost;
  if (clash.length && !replace) {
    const what = clash.map(([k, cur]) => (k === "transporterDetails" ? `transporter “${cur}”` : `cost ₹${formatNumber(cur)}`)).join(" and ");
    return { ok: false, confirm: `Job ${row.jobNo} in Domestic MIS already has ${what}. Replace with ${bid.name} ₹${cost === undefined ? "—" : formatNumber(cost)}?` };
  }

  const updated = await db.misJob.update({ where: { id: job.id }, data: patch });
  await recordChange({
    userId: user.id,
    entityType: "MisJob",
    entityId: job.id,
    action: "updated",
    message: `Job ${job.jobNo}: transporter and freight from the D-0 quotation (${slot})`,
    changes: diff(job, updated),
  });
  revalidatePath("/b2b/mis");
  return {
    ok: true,
    note: `Approved ${label} for job ${row.jobNo} — transporter and ₹${cost === undefined ? "—" : formatNumber(cost)} saved in Domestic MIS.`,
  };
}
