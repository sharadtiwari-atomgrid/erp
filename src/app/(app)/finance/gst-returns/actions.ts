"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordChange } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isPeriod } from "@/lib/finance/gst";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { dayFromIso, parseDay, todayIso } from "@/lib/ops/dates";
import { loadGstReturns, snapshotOf } from "./_lib/load";

const TYPES = ["GSTR-1", "GSTR-3B"] as const;

const filedSchema = z.object({
  type: z.enum(TYPES),
  period: z.string().refine(isPeriod, "Choose a month"),
  arn: f.text("ARN").max(40, "ARN is too long"),
  filedOn: z.string().transform((v, ctx) => {
    const iso = parseDay(v);
    if (!iso) ctx.addIssue({ code: "custom", message: "Enter the filing date" });
    return iso;
  }),
  notes: f.optionalText(),
});

/** Records that a return was filed on the GST portal (ARN and date) with the figures as filed. */
export async function markGstReturnFiled(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const parsed = parseForm(filedSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { type, period, arn, filedOn, notes } = parsed.data;
  if (filedOn > todayIso()) return { error: "The filing date cannot be in the future.", fieldErrors: { filedOn: ["Cannot be in the future"] } };

  const data = await loadGstReturns(period);
  const snapshot = { ...snapshotOf(data, type), capturedAt: new Date().toISOString() };
  const saved = await db.$transaction(async (tx) => {
    const row = await tx.gstReturn.upsert({
      where: { type_period: { type, period } },
      create: { type, period, status: "Filed", arn: arn.toUpperCase(), filedOn: dayFromIso(filedOn), notes, snapshot },
      update: { status: "Filed", arn: arn.toUpperCase(), filedOn: dayFromIso(filedOn), notes, snapshot },
    });
    await recordChange(
      { userId: user.id, entityType: "GstReturn", entityId: row.id, action: "filed", message: `${type} for ${period} marked as filed (ARN ${row.arn})` },
      tx,
    );
    return row;
  });
  revalidatePath("/finance/gst-returns");
  return { success: `${saved.type} for ${period} marked as filed.` };
}

/** Puts a filed return back to draft (e.g. the ARN was entered against the wrong month). */
export async function reopenGstReturn(type: string, period: string): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  if (!TYPES.includes(type as (typeof TYPES)[number]) || !isPeriod(period)) return { error: "Unknown return." };
  const row = await db.gstReturn.findUnique({ where: { type_period: { type, period } } });
  if (!row) return { error: "This return has not been marked as filed." };
  await db.$transaction(async (tx) => {
    await tx.gstReturn.update({ where: { id: row.id }, data: { status: "Draft" } });
    await recordChange({ userId: user.id, entityType: "GstReturn", entityId: row.id, action: "reopened", message: `${type} for ${period} set back to draft (was ARN ${row.arn ?? "—"})` }, tx);
  });
  revalidatePath("/finance/gst-returns");
  return { success: "Set back to draft." };
}
