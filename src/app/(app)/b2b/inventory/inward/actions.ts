"use server";

import { revalidatePath } from "next/cache";
import { diff, recordChange } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayIso } from "@/lib/ops/dates";
import { cleanInward, lineKey, rowsFromSheet, type InwardEntry } from "@/lib/batch-inventory";
import { inwardData, isAdmin, pickSheet, readSheets } from "../_lib/server";
import { errorText, type ActionResult, type ImportResult, type Preview } from "../_lib/types";

const PATH = "/b2b/inventory/inward";
const ENTITY = "BatchInward";
const labelOf = (e: Pick<InwardEntry, "productName" | "batchNo">) => `${e.productName}${e.batchNo ? ` · ${e.batchNo}` : ""}`;

function problem(e: InwardEntry): string {
  if (!e.inwardDate) return "Enter the inward date.";
  if (!e.productName) return "Enter the product name.";
  if (!e.location) return "Pick the location.";
  if (e.netWeight === null) return `Enter the net weight for batch ${e.batchNo || "(no batch no.)"}.`;
  return "";
}

/** A new receipt: one line per batch (common fields copied onto each). */
export async function createInward(list: Record<string, unknown>[]): Promise<ActionResult> {
  const user = await requireUser("batchInventory", "edit");
  const entries = (Array.isArray(list) ? list : []).map(cleanInward);
  if (!entries.length) return { ok: false, error: "Add at least one batch." };
  const bad = entries.map(problem).find(Boolean);
  if (bad) return { ok: false, error: bad };
  try {
    await db.$transaction(async (tx) => {
      for (const e of entries) {
        const row = await tx.batchInward.create({ data: inwardData(e) });
        await recordChange({ userId: user.id, entityType: ENTITY, entityId: row.id, action: "created", message: `Inward ${labelOf(e)} · ${e.netWeight} kg at ${e.location}` }, tx);
      }
    });
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }
  revalidatePath(PATH);
  return { ok: true, message: `${entries.length} line${entries.length > 1 ? "s" : ""} saved.` };
}

export async function updateInward(id: string, values: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireUser("batchInventory", "edit");
  const e = cleanInward(values);
  const bad = problem(e);
  if (bad) return { ok: false, error: bad };
  try {
    const before = await db.batchInward.findFirst({ where: { id, deletedAt: null } });
    if (!before) return { ok: false, error: "This line no longer exists." };
    const after = await db.batchInward.update({ where: { id }, data: inwardData(e) });
    await recordChange({ userId: user.id, entityType: ENTITY, entityId: id, action: "updated", message: `Edited inward ${labelOf(e)}`, changes: diff(before, after) });
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }
  revalidatePath(PATH);
  return { ok: true };
}

/** Soft delete. */
export async function deleteInward(id: string): Promise<ActionResult> {
  const user = await requireUser("batchInventory", "edit");
  const row = await db.batchInward.findFirst({ where: { id, deletedAt: null } });
  if (!row) return { ok: false, error: "This line no longer exists." };
  await db.batchInward.update({ where: { id }, data: { deletedAt: new Date() } });
  await recordChange({ userId: user.id, entityType: ENTITY, entityId: id, action: "deleted", message: `Deleted inward ${labelOf({ productName: row.productName, batchNo: row.batchNo ?? "" })}` });
  revalidatePath(PATH);
  return { ok: true };
}

/** Reads the inward sheet (server-side) → entries and the issues to look at. Nothing is saved. */
export async function previewInwardImport(fd: FormData): Promise<Preview<InwardEntry>> {
  await requireUser("batchInventory", "edit");
  try {
    const file = fd.get("file") as File;
    const sheets = await readSheets(file);
    const { entries, issues } = rowsFromSheet(pickSheet(sheets, /inward/i), todayIso());
    return { ok: true, fileName: file.name, entries, issues };
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }
}

/**
 *   add     — only lines not already here (same job, GRN, batch, product, net weight, date: lineKey)
 *   replace — Admins only: every current line is set aside (soft-deleted) and the sheet's lines go in
 */
export async function importInward(input: { mode: "add" | "replace"; fileName: string; entries: Record<string, unknown>[] }): Promise<ImportResult> {
  const user = await requireUser("batchInventory", "edit");
  const mode = input.mode === "replace" ? "replace" : "add";
  if (mode === "replace" && !isAdmin(user)) return { ok: false, error: "Only an Admin can replace all Inward lines." };
  const entries = (Array.isArray(input.entries) ? input.entries : []).map(cleanInward).filter((e) => e.netWeight !== null && (e.productName || e.batchNo));
  if (!entries.length) return { ok: false, error: "The sheet has no lines with a net weight." };
  for (const e of entries) if (!e.productName) e.productName = e.catalogueName || "—";
  let added = 0;
  let skipped = 0;
  let removed = 0;
  let created: { id: string; productName: string; batchNo: string | null }[] = [];
  try {
    await db.$transaction(
      async (tx) => {
        let todo = entries;
        if (mode === "replace") {
          const gone = await tx.batchInward.findMany({ where: { deletedAt: null }, select: { id: true } });
          removed = (await tx.batchInward.updateMany({ where: { deletedAt: null }, data: { deletedAt: new Date() } })).count;
          for (const g of gone) await recordChange({ userId: user.id, entityType: ENTITY, entityId: g.id, action: "deleted", message: `Set aside: Inward replaced from ${input.fileName}` }, tx);
        } else {
          const have = new Set((await tx.batchInward.findMany({ where: { deletedAt: null }, select: { lineKey: true } })).map((r) => r.lineKey));
          todo = entries.filter((e) => {
            const k = lineKey(e);
            if (have.has(k)) {
              skipped++;
              return false;
            }
            have.add(k);
            return true;
          });
        }
        if (todo.length) created = await tx.batchInward.createManyAndReturn({ data: todo.map(inwardData), select: { id: true, productName: true, batchNo: true } });
        added = created.length;
        for (const c of created)
          await recordChange({ userId: user.id, entityType: ENTITY, entityId: c.id, action: "created", message: `Imported from ${input.fileName}: ${labelOf({ productName: c.productName, batchNo: c.batchNo ?? "" })}` }, tx);
      },
      { timeout: 120_000 },
    );
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }
  revalidatePath(PATH);
  return { ok: true, added, skipped, removed };
}
