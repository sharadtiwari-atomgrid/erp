"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { recordChange } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { money, normalBalance } from "@/lib/finance/chart";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { dayFromIso, isoFromDay } from "@/lib/ops/dates";
import { fiscalMonths, uplift } from "../_gl/ledger";
import { actualsByMonth, budgetAccounts, budgetDims } from "./data";

const budgetSchema = z.object({
  name: f.text("Name"),
  fiscalYearId: f.id("Financial year"),
  dimension: f.optionalText(),
  notes: f.optionalText(),
});

export async function createBudget(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  await ensureFinanceSetup();
  const parsed = parseForm(budgetSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { name, fiscalYearId, dimension, notes } = parsed.data;
  const dimensions: Record<string, string> = {};
  if (dimension) {
    const [code, value] = dimension.split("=");
    if (code && value) dimensions[code] = value;
  }
  const clash = await db.budget.findUnique({ where: { name_fiscalYearId: { name, fiscalYearId } } });
  if (clash) return { error: "Please fix the highlighted fields.", fieldErrors: { name: ["A budget with this name already exists for that year"] } };
  const budget = await db.$transaction(async (tx) => {
    const created = await tx.budget.create({ data: { name, fiscalYearId, dimensions, notes } });
    await recordChange({ userId: user.id, entityType: "Budget", entityId: created.id, action: "created", message: `Budget ${name} created` }, tx);
    return created;
  });
  revalidatePath("/finance/budgets");
  redirect(`/finance/budgets/${budget.id}`);
}

const cellsSchema = z.array(z.object({ accountId: z.string().min(1), month: z.string().regex(/^\d{4}-\d{2}-01$/), amount: z.coerce.number() }));

export async function saveBudgetLines(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const budget = await db.budget.findUnique({ where: { id }, include: { fiscalYear: true } });
  if (!budget) return { error: "This budget no longer exists." };
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("cells") ?? "[]"));
  } catch {
    return { error: "Could not read the budget grid." };
  }
  const cells = cellsSchema.safeParse(raw);
  if (!cells.success) return { error: "Could not read the budget grid." };
  const months = new Set(fiscalMonths(Number(isoFromDay(budget.fiscalYear.startDate).slice(0, 4))));
  const allowed = new Set((await budgetAccounts(id)).map((a) => a.id));
  const rows = cells.data.filter((c) => months.has(c.month) && allowed.has(c.accountId) && money(c.amount) !== 0);

  await db.$transaction(async (tx) => {
    await tx.budgetLine.deleteMany({ where: { budgetId: id } });
    if (rows.length) {
      await tx.budgetLine.createMany({ data: rows.map((c) => ({ budgetId: id, accountId: c.accountId, month: dayFromIso(c.month), amount: money(c.amount) })) });
    }
    await tx.budget.update({ where: { id }, data: { updatedAt: new Date() } });
    await recordChange({ userId: user.id, entityType: "Budget", entityId: id, action: "updated", message: `Budget ${budget.name} saved`, changes: { lines: ["", `${rows.length} amounts`] } }, tx);
  });
  revalidatePath(`/finance/budgets/${id}`);
  revalidatePath("/finance/budgets");
  return { success: "Budget saved." };
}

/** Replaces the budget with last year's actuals for the same months, optionally uplifted by a %. */
export async function copyFromLastYear(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const budget = await db.budget.findUnique({ where: { id }, include: { fiscalYear: true } });
  if (!budget) return { error: "This budget no longer exists." };
  const pct = Number(formData.get("uplift") ?? 0);
  if (!Number.isFinite(pct) || pct < -100 || pct > 1000) return { error: "Enter an uplift between -100% and 1000%." };
  const startYear = Number(isoFromDay(budget.fiscalYear.startDate).slice(0, 4));
  const thisYear = fiscalMonths(startYear);
  const lastYear = fiscalMonths(startYear - 1);
  const actuals = await actualsByMonth(lastYear[0], `${startYear}-03-31`, budgetDims(budget.dimensions));
  const accounts = await budgetAccounts(id);

  const data: Array<{ budgetId: string; accountId: string; month: Date; amount: number }> = [];
  for (const a of accounts) {
    const byMonth = actuals.get(a.id);
    if (!byMonth) continue;
    lastYear.forEach((m, i) => {
      const t = byMonth.get(m);
      if (!t) return;
      const amount = uplift(normalBalance(a.type, t.debit, t.credit), pct);
      if (amount !== 0) data.push({ budgetId: id, accountId: a.id, month: dayFromIso(thisYear[i]), amount });
    });
  }
  await db.$transaction(async (tx) => {
    await tx.budgetLine.deleteMany({ where: { budgetId: id } });
    if (data.length) await tx.budgetLine.createMany({ data });
    await recordChange({ userId: user.id, entityType: "Budget", entityId: id, action: "updated", message: `Budget ${budget.name} copied from last year's actuals${pct ? ` with ${pct}% uplift` : ""}`, changes: { lines: ["", `${data.length} amounts`] } }, tx);
  });
  revalidatePath(`/finance/budgets/${id}`);
  return { success: data.length ? `Copied ${data.length} amounts from last year.` : "Last year has no income or expense actuals to copy." };
}

export async function deleteBudget(id: string): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const budget = await db.budget.findUnique({ where: { id } });
  if (!budget) return { error: "This budget no longer exists." };
  await db.$transaction(async (tx) => {
    await tx.budget.delete({ where: { id } });
    await recordChange({ userId: user.id, entityType: "Budget", entityId: id, action: "deleted", message: `Budget ${budget.name} deleted` }, tx);
  });
  revalidatePath("/finance/budgets");
  redirect("/finance/budgets");
}
