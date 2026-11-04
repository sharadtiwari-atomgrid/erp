"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordChange } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { f, parseForm, type ActionState } from "@/lib/forms";

const code = () =>
  f
    .text("Code")
    .transform((v) => v.toUpperCase())
    .pipe(z.string().max(30, "Code is too long").regex(/^[A-Z0-9_\-]+$/, "Use letters, digits, dashes or underscores"));

const createSchema = z.object({ code: code(), name: f.text("Name") });
const editSchema = z.object({ name: f.text("Name"), isActive: f.checkbox() });

function done() {
  revalidatePath("/finance/dimensions");
}

/** Ledger entries, journal lines and budgets tagged with a dimension (and optionally one value). */
async function usage(dimension: string, value?: string): Promise<number> {
  if (!value) {
    // Any value of the dimension: rows whose JSON has the key.
    const rows = await db.$queryRaw<Array<{ n: bigint }>>`
      SELECT (SELECT COUNT(*) FROM "GlEntry" WHERE dimensions ? ${dimension})
           + (SELECT COUNT(*) FROM "JournalLine" WHERE dimensions ? ${dimension})
           + (SELECT COUNT(*) FROM "Budget" WHERE dimensions ? ${dimension}) AS n`;
    return Number(rows[0]?.n ?? 0);
  }
  const where = { dimensions: { path: [dimension], equals: value } };
  const [a, b, c] = await Promise.all([db.glEntry.count({ where }), db.journalLine.count({ where }), db.budget.count({ where })]);
  return a + b + c;
}

export async function createDimension(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  await ensureFinanceSetup();
  const parsed = parseForm(createSchema, formData);
  if (!parsed.ok) return parsed.state;
  if (await db.dimension.findUnique({ where: { code: parsed.data.code } })) return { error: `A dimension with code ${parsed.data.code} already exists.` };
  const d = await db.dimension.create({ data: parsed.data });
  await recordChange({ userId: user.id, entityType: "Dimension", entityId: d.id, action: "created", message: `Dimension ${d.code} created` });
  done();
  return { success: `${d.name} added.` };
}

export async function updateDimension(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const parsed = parseForm(editSchema, formData);
  if (!parsed.ok) return parsed.state;
  const d = await db.dimension.update({ where: { id }, data: parsed.data });
  await recordChange({ userId: user.id, entityType: "Dimension", entityId: id, action: "updated", message: `Dimension ${d.code} updated`, changes: { name: ["", d.name], isActive: ["", d.isActive] } });
  done();
  return { success: "Saved." };
}

export async function deleteDimension(id: string): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const d = await db.dimension.findUnique({ where: { id } });
  if (!d) return { error: "This dimension no longer exists." };
  if (await usage(d.code)) {
    await db.dimension.update({ where: { id }, data: { isActive: false } });
    await recordChange({ userId: user.id, entityType: "Dimension", entityId: id, action: "deactivated", message: `Dimension ${d.code} deactivated (in use)` });
    done();
    return { success: `${d.name} is used on entries, so it was deactivated instead of deleted.` };
  }
  await db.dimension.delete({ where: { id } });
  await recordChange({ userId: user.id, entityType: "Dimension", entityId: id, action: "deleted", message: `Dimension ${d.code} deleted` });
  done();
  return { success: `${d.name} deleted.` };
}

export async function addValue(dimensionId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const parsed = parseForm(createSchema, formData);
  if (!parsed.ok) return parsed.state;
  const exists = await db.dimensionValue.findUnique({ where: { dimensionId_code: { dimensionId, code: parsed.data.code } } });
  if (exists) return { error: `Value ${parsed.data.code} already exists.` };
  const v = await db.dimensionValue.create({ data: { ...parsed.data, dimensionId } });
  await recordChange({ userId: user.id, entityType: "Dimension", entityId: dimensionId, action: "updated", message: `Value ${v.code} added`, changes: { [v.code]: ["", v.name] } });
  done();
  return { success: `${v.name} added.` };
}

export async function updateValue(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const parsed = parseForm(editSchema, formData);
  if (!parsed.ok) return parsed.state;
  const before = await db.dimensionValue.findUnique({ where: { id } });
  if (!before) return { error: "This value no longer exists." };
  const v = await db.dimensionValue.update({ where: { id }, data: parsed.data });
  await recordChange({ userId: user.id, entityType: "Dimension", entityId: v.dimensionId, action: "updated", message: `Value ${v.code} updated`, changes: { [`${v.code} name`]: [before.name, v.name], [`${v.code} active`]: [before.isActive, v.isActive] } });
  done();
  return { success: "Saved." };
}

export async function deleteValue(id: string): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const v = await db.dimensionValue.findUnique({ where: { id }, include: { dimension: true } });
  if (!v) return { error: "This value no longer exists." };
  if (await usage(v.dimension.code, v.code)) {
    await db.dimensionValue.update({ where: { id }, data: { isActive: false } });
    await recordChange({ userId: user.id, entityType: "Dimension", entityId: v.dimensionId, action: "updated", message: `Value ${v.code} deactivated (in use)` });
    done();
    return { success: `${v.name} is in use, so it was deactivated instead of deleted.` };
  }
  await db.dimensionValue.delete({ where: { id } });
  await recordChange({ userId: user.id, entityType: "Dimension", entityId: v.dimensionId, action: "updated", message: `Value ${v.code} deleted` });
  done();
  return { success: `${v.name} deleted.` };
}

/** Adds a BRANCH dimension value for every ERP branch that doesn't have one yet. */
export async function syncBranchValues(): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  await ensureFinanceSetup();
  const dim = await db.dimension.upsert({ where: { code: "BRANCH" }, create: { code: "BRANCH", name: "Branch" }, update: {} });
  const [branches, existing] = await Promise.all([
    db.branch.findMany({ select: { code: true, name: true, isActive: true } }),
    db.dimensionValue.findMany({ where: { dimensionId: dim.id }, select: { code: true } }),
  ]);
  const have = new Set(existing.map((e) => e.code));
  const missing = branches.filter((b) => !have.has(b.code));
  if (missing.length) {
    await db.dimensionValue.createMany({ data: missing.map((b) => ({ dimensionId: dim.id, code: b.code, name: b.name, isActive: b.isActive })), skipDuplicates: true });
    await recordChange({ userId: user.id, entityType: "Dimension", entityId: dim.id, action: "updated", message: `Branch values synced: ${missing.map((b) => b.code).join(", ")}` });
  }
  done();
  return { success: missing.length ? `Added ${missing.length} branch value${missing.length === 1 ? "" : "s"}.` : "Branch values are already up to date." };
}
