"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordChange } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db, type Tx } from "@/lib/db";
import { postDepreciationRun, reverseDepreciationRun } from "@/lib/finance/assets";
import { money } from "@/lib/finance/chart";
import { formatMoney } from "@/lib/format";
import { parseForm, type ActionState } from "@/lib/forms";
import { dayFromIso, formatDmy, isoFromDay } from "@/lib/ops/dates";
import { nextDocumentNumber } from "@/lib/sequence";
import { toDepreciable } from "../_cash_fa/asset-data";
import { depreciationFor, periodRange } from "../_cash_fa/depreciation";
import { attempt, CashFaError } from "../_cash_fa/server";

/** Depreciation due for every active asset up to the period end. */
async function calculateLines(tx: Tx, periodEnd: string) {
  const assets = await tx.fixedAsset.findMany({ where: { status: "ACTIVE", acquisitionDate: { lte: dayFromIso(periodEnd) } }, orderBy: { code: "asc" } });
  return assets
    .map((a) => ({ assetId: a.id, result: depreciationFor(toDepreciable(a), periodEnd) }))
    .filter((l) => l.result.amount > 0)
    .map((l) => ({ assetId: l.assetId, openingBookValue: l.result.openingBookValue, amount: l.result.amount }));
}

function refresh(id?: string) {
  revalidatePath("/finance/depreciation");
  if (id) revalidatePath(`/finance/depreciation/${id}`);
  revalidatePath("/finance/fixed-assets", "layout");
}

const runSchema = z.object({
  kind: z.enum(["month", "quarter", "year"], { error: "Choose a period" }),
  anchor: z.iso.date("Choose a date in the period"),
});

/** Creates a draft run for the month, quarter or financial year containing the chosen date. */
export async function createRun(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const parsed = parseForm(runSchema, formData);
  if (!parsed.ok) return parsed.state;
  const period = periodRange(parsed.data.kind, parsed.data.anchor);
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const lines = await calculateLines(tx, period.end);
      if (lines.length === 0) throw new CashFaError(`No active asset has depreciation due up to ${formatDmy(period.end)}.`);
      const number = await nextDocumentNumber(tx, "DEPRECIATION");
      const run = await tx.depreciationRun.create({
        data: {
          number,
          periodStart: dayFromIso(period.start),
          periodEnd: dayFromIso(period.end),
          total: money(lines.reduce((s, l) => s + l.amount, 0)),
          lines: { create: lines },
        },
      });
      await recordChange({ userId: user.id, entityType: "DepreciationRun", entityId: run.id, action: "created", message: `Depreciation run ${number} for ${period.label} calculated` }, tx);
      return run;
    }),
  );
  if (!result.ok) return { error: result.error };
  refresh();
  redirect(`/finance/depreciation/${result.value.id}`);
}

/** Recalculates a draft run's lines with the assets as they are now. */
async function recalculate(tx: Tx, runId: string) {
  const run = await tx.depreciationRun.findUnique({ where: { id: runId } });
  if (!run) throw new CashFaError("Run not found.");
  if (run.status !== "DRAFT") throw new CashFaError("Only a draft run can be recalculated.");
  const lines = await calculateLines(tx, isoFromDay(run.periodEnd));
  await tx.depreciationLine.deleteMany({ where: { runId } });
  if (lines.length) await tx.depreciationLine.createMany({ data: lines.map((l) => ({ ...l, runId })) });
  await tx.depreciationRun.update({ where: { id: runId }, data: { total: money(lines.reduce((s, l) => s + l.amount, 0)) } });
  return run;
}

export async function recalculateRun(id: string): Promise<ActionState> {
  await requireUser("finance", "edit");
  const result = await attempt(() => db.$transaction((tx) => recalculate(tx, id)));
  if (!result.ok) return { error: result.error };
  refresh(id);
  return undefined;
}

/** Recalculates, then posts Dr Depreciation / Cr Accumulated depreciation and updates the assets. */
export async function postRun(id: string): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const result = await attempt(() =>
    db.$transaction(
      async (tx) => {
        const run = await recalculate(tx, id);
        const transactionNo = await postDepreciationRun(tx, id, user.id);
        const posted = await tx.depreciationRun.findUniqueOrThrow({ where: { id }, select: { total: true } });
        await recordChange({ userId: user.id, entityType: "DepreciationRun", entityId: id, action: "posted", message: `Depreciation run ${run.number} posted for ${formatMoney(posted.total)} (transaction ${transactionNo})` }, tx);
        return transactionNo;
      },
      { timeout: 60_000 },
    ),
  );
  if (!result.ok) return { error: result.error };
  refresh(id);
  revalidatePath("/finance", "layout");
  return undefined;
}

export async function deleteRun(id: string): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const run = await db.depreciationRun.findUnique({ where: { id } });
  if (!run) return { error: "Run not found." };
  if (run.status !== "DRAFT") return { error: "Only a draft run can be deleted. Reverse a posted run instead." };
  await db.$transaction(async (tx) => {
    await tx.depreciationRun.delete({ where: { id } });
    await recordChange({ userId: user.id, entityType: "DepreciationRun", entityId: id, action: "deleted", message: `Draft depreciation run ${run.number} deleted` }, tx);
  });
  refresh();
  redirect("/finance/depreciation");
}

const reverseSchema = z.object({ date: z.iso.date("Enter the reversal date") });

/** Posts the opposite of the run and restores the assets' accumulated depreciation and depreciated-to dates. */
export async function reverseRun(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const parsed = parseForm(reverseSchema, formData);
  if (!parsed.ok) return parsed.state;
  const result = await attempt(() =>
    db.$transaction(
      async (tx) => {
        const run = await tx.depreciationRun.findUnique({ where: { id }, select: { number: true } });
        if (!run) throw new CashFaError("Run not found.");
        const reversalTx = await reverseDepreciationRun(tx, id, { date: parsed.data.date, userId: user.id });
        await recordChange({ userId: user.id, entityType: "DepreciationRun", entityId: id, action: "reversed", message: `Depreciation run ${run.number} reversed (transaction ${reversalTx})` }, tx);
        return reversalTx;
      },
      { timeout: 60_000 },
    ),
  );
  if (!result.ok) return { error: result.error };
  refresh(id);
  revalidatePath("/finance", "layout");
  return undefined;
}
