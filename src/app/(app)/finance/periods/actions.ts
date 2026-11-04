"use server";

import { revalidatePath } from "next/cache";
import { recordChange } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { closeFiscalYear, nextYearStart, reopenFiscalYear } from "@/lib/finance/closing";
import { ensureFiscalYear, ensureFinanceSetup } from "@/lib/finance/setup";
import { formatMoney } from "@/lib/format";
import type { ActionState } from "@/lib/forms";
import { attempt } from "../_gl/server";

function done() {
  revalidatePath("/finance/periods");
}

export async function createNextYear(): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  await ensureFinanceSetup();
  const latest = await db.fiscalYear.findFirst({ orderBy: { startDate: "desc" } });
  if (!latest) return { error: "No financial year exists yet." };
  const fy = await db.$transaction(async (tx) => {
    const created = await ensureFiscalYear(tx, nextYearStart(latest.endDate));
    await recordChange({ userId: user.id, entityType: "FiscalYear", entityId: created.id, action: "created", message: `${created.name} created` }, tx);
    return created;
  });
  done();
  return { success: `${fy.name} created with 12 periods.` };
}

export async function setPeriodClosed(id: string, closed: boolean): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const period = await db.accountingPeriod.findUnique({ where: { id }, include: { fiscalYear: true } });
  if (!period) return { error: "This period no longer exists." };
  if (period.fiscalYear.closed) return { error: `${period.fiscalYear.name} is closed. Reopen the year first.` };
  await db.$transaction(async (tx) => {
    await tx.accountingPeriod.update({ where: { id }, data: { closed, closedAt: closed ? new Date() : null } });
    await recordChange({ userId: user.id, entityType: "AccountingPeriod", entityId: id, action: closed ? "closed" : "reopened", message: `${period.name} ${closed ? "closed" : "reopened"}` }, tx);
  });
  done();
  return { success: `${period.name} ${closed ? "closed" : "reopened"}.` };
}

/** Closes every period of a year up to and including the given one. */
export async function closePeriodsThrough(id: string): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const period = await db.accountingPeriod.findUnique({ where: { id }, include: { fiscalYear: true } });
  if (!period) return { error: "This period no longer exists." };
  if (period.fiscalYear.closed) return { error: `${period.fiscalYear.name} is closed.` };
  const { count } = await db.accountingPeriod.updateMany({
    where: { fiscalYearId: period.fiscalYearId, startDate: { lte: period.startDate }, closed: false },
    data: { closed: true, closedAt: new Date() },
  });
  await recordChange({ userId: user.id, entityType: "FiscalYear", entityId: period.fiscalYearId, action: "closed", message: `${count} period(s) closed through ${period.name}` });
  done();
  return { success: `${count} period${count === 1 ? "" : "s"} closed.` };
}

export async function closeYear(id: string): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const r = await closeFiscalYear(tx, id, user.id);
      await recordChange({ userId: user.id, entityType: "FiscalYear", entityId: id, action: "closed", message: `Year-end close posted${r.transactionNo ? ` (transaction ${r.transactionNo})` : ""}; result ${formatMoney(r.profit)}` }, tx);
      return r;
    }, { timeout: 60_000 }),
  );
  if (!result.ok) return { error: result.error };
  done();
  revalidatePath("/finance/entries");
  const { profit, transactionNo } = result.value;
  return {
    success: transactionNo
      ? `Year closed. ${profit >= 0 ? "Profit" : "Loss"} of ${formatMoney(Math.abs(profit))} transferred to retained earnings (transaction ${transactionNo}).`
      : "Year closed. There were no income or expense balances to transfer.",
  };
}

export async function reopenYear(id: string): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const r = await reopenFiscalYear(tx, id, user.id);
      await recordChange({ userId: user.id, entityType: "FiscalYear", entityId: id, action: "reopened", message: `Year reopened${r.reversalTxNo ? `; closing reversed (transaction ${r.reversalTxNo})` : ""}` }, tx);
      return r;
    }, { timeout: 60_000 }),
  );
  if (!result.ok) return { error: result.error };
  done();
  revalidatePath("/finance/entries");
  return { success: "Year reopened. Its periods stay closed until you reopen them." };
}
