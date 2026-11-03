"use server";

import { revalidatePath } from "next/cache";
import { diff, recordChange } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayIso } from "@/lib/ops/dates";
import { cleanOutward, outKey, rowsFromOutwardSheet, type OutwardEntry } from "@/lib/batch-inventory";
import { isAdmin, outwardData, pickSheet, readSheets } from "../_lib/server";
import { errorText, type ActionResult, type ImportResult, type Preview } from "../_lib/types";

const PATHS = ["/b2b/inventory/outward", "/b2b/inventory/inward", "/b2b/inventory/stock"];
const ENTITY = "BatchOutward";
const labelOf = (e: { productName: string; batchNo: string | null; qty?: unknown }) => `${e.productName}${e.batchNo ? ` · ${e.batchNo}` : ""}${e.qty !== undefined ? ` · ${e.qty} kg` : ""}`;
const revalidate = () => PATHS.forEach((p) => revalidatePath(p));

function problem(e: OutwardEntry): string {
  if (!e.obDate) return "Enter the OB date.";
  if (!e.batchNo) return "Enter the batch for every line.";
  if (e.qty === null) return `Enter the quantity for batch ${e.batchNo}.`;
  if (!e.productName && !e.catalogueName) return `Enter the product for batch ${e.batchNo}.`;
  return "";
}

/** A new dispatch entered in the ERP (source "crm": taken off its batch's stock). */
export async function createOutward(list: Record<string, unknown>[]): Promise<ActionResult> {
  const user = await requireUser("batchInventory", "edit");
  const entries = (Array.isArray(list) ? list : []).map(cleanOutward);
  if (!entries.length) return { ok: false, error: "Add at least one line." };
  const bad = entries.map(problem).find(Boolean);
  if (bad) return { ok: false, error: bad };
  try {
    await db.$transaction(async (tx) => {
      for (const e of entries) {
        const row = await tx.batchOutward.create({ data: outwardData(e, "crm") });
        await recordChange({ userId: user.id, entityType: ENTITY, entityId: row.id, action: "created", message: `Outward ${labelOf(e)}${e.customer ? ` to ${e.customer}` : ""}` }, tx);
      }
    });
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }
  revalidate();
  return { ok: true, message: `${entries.length} line${entries.length > 1 ? "s" : ""} saved.` };
}

/** Edit a line; it keeps its source (a sheet line stays a sheet line and doesn't move stock). */
export async function updateOutward(id: string, values: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireUser("batchInventory", "edit");
  const e = cleanOutward(values);
  const bad = problem(e);
  if (bad) return { ok: false, error: bad };
  try {
    const before = await db.batchOutward.findFirst({ where: { id, deletedAt: null } });
    if (!before) return { ok: false, error: "This line no longer exists." };
    const after = await db.batchOutward.update({ where: { id }, data: outwardData(e, before.source === "sheet" ? "sheet" : "crm") });
    await recordChange({ userId: user.id, entityType: ENTITY, entityId: id, action: "updated", message: `Edited outward ${labelOf(e)}`, changes: diff(before, after) });
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }
  revalidate();
  return { ok: true };
}

/** Soft delete (an ERP line's quantity goes back into its batch's stock). */
export async function deleteOutward(id: string): Promise<ActionResult> {
  const user = await requireUser("batchInventory", "edit");
  const row = await db.batchOutward.findFirst({ where: { id, deletedAt: null } });
  if (!row) return { ok: false, error: "This line no longer exists." };
  await db.batchOutward.update({ where: { id }, data: { deletedAt: new Date() } });
  await recordChange({ userId: user.id, entityType: ENTITY, entityId: id, action: "deleted", message: `Deleted outward ${labelOf({ productName: row.productName, batchNo: row.batchNo, qty: Number(row.qty) })}` });
  revalidate();
  return { ok: true };
}

export async function previewOutwardImport(fd: FormData): Promise<Preview<OutwardEntry>> {
  await requireUser("batchInventory", "edit");
  try {
    const file = fd.get("file") as File;
    const { entries, issues } = rowsFromOutwardSheet(pickSheet(await readSheets(file), /outward/i), todayIso());
    return { ok: true, fileName: file.name, entries, issues };
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }
}

/**
 * Lines from the outward sheet (source "sheet": already counted in the Inward sheet's Outward Qty).
 *   add     — only lines not already here (outKey: job, date, customer, batch, qty, GRN)
 *   replace — Admins only: the sheet's earlier lines are set aside; lines entered in the ERP stay
 */
export async function importOutward(input: { mode: "add" | "replace"; fileName: string; entries: Record<string, unknown>[] }): Promise<ImportResult> {
  const user = await requireUser("batchInventory", "edit");
  const mode = input.mode === "replace" ? "replace" : "add";
  if (mode === "replace" && !isAdmin(user)) return { ok: false, error: "Only an Admin can replace the Outward lines." };
  const entries = (Array.isArray(input.entries) ? input.entries : []).map(cleanOutward).filter((e) => e.qty !== null);
  if (!entries.length) return { ok: false, error: "The sheet has no lines with a quantity." };
  let added = 0;
  let skipped = 0;
  let removed = 0;
  try {
    await db.$transaction(
      async (tx) => {
        let todo = entries;
        if (mode === "replace") {
          const gone = await tx.batchOutward.findMany({ where: { deletedAt: null, source: "sheet" }, select: { id: true } });
          removed = (await tx.batchOutward.updateMany({ where: { deletedAt: null, source: "sheet" }, data: { deletedAt: new Date() } })).count;
          for (const g of gone) await recordChange({ userId: user.id, entityType: ENTITY, entityId: g.id, action: "deleted", message: `Set aside: Outward sheet lines replaced from ${input.fileName}` }, tx);
        } else {
          const have = new Set((await tx.batchOutward.findMany({ where: { deletedAt: null }, select: { outKey: true } })).map((r) => r.outKey));
          todo = entries.filter((e) => {
            const k = outKey(e);
            if (have.has(k)) {
              skipped++;
              return false;
            }
            have.add(k);
            return true;
          });
        }
        const created = todo.length ? await tx.batchOutward.createManyAndReturn({ data: todo.map((e) => outwardData(e, "sheet")), select: { id: true, productName: true, batchNo: true, qty: true } }) : [];
        added = created.length;
        for (const c of created)
          await recordChange({ userId: user.id, entityType: ENTITY, entityId: c.id, action: "created", message: `Imported from ${input.fileName}: ${labelOf({ productName: c.productName, batchNo: c.batchNo, qty: Number(c.qty) })}` }, tx);
      },
      { timeout: 120_000 },
    );
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }
  revalidate();
  return { ok: true, added, skipped, removed };
}
