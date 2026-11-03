"use server";

import { revalidatePath } from "next/cache";
import { diff, recordChange } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { REGISTERS, cleanEntry, entryKey, labelOf, problem, rowsFromRegisterSheet, type RegisterEntry, type RegisterKind } from "@/lib/batch-inventory";
import { ISSUE_KIND, issueData } from "./registers-server";
import { pickSheet, readSheets } from "./server";
import { errorText, type ActionResult, type ImportResult, type Preview } from "./types";

const ENTITY = "InventoryIssue";
const known = (kind: string): kind is RegisterKind => kind === "lost-found" || kind === "damage";

/** Create (id null) or update a register entry. These registers never move stock. */
export async function saveRegisterEntry(kind: RegisterKind, id: string | null, values: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireUser("batchInventory", "edit");
  if (!known(kind)) return { ok: false, error: "Unknown register" };
  const R = REGISTERS[kind];
  const e = cleanEntry(kind, values);
  const bad = problem(e);
  if (bad) return { ok: false, error: bad };
  try {
    if (!id) {
      const row = await db.inventoryIssue.create({ data: issueData(kind, e) });
      await recordChange({ userId: user.id, entityType: ENTITY, entityId: row.id, action: "created", message: `${R.label}: ${labelOf(e)}` });
    } else {
      const before = await db.inventoryIssue.findFirst({ where: { id, kind: ISSUE_KIND[kind], deletedAt: null } });
      if (!before) return { ok: false, error: "This entry no longer exists." };
      const after = await db.inventoryIssue.update({ where: { id }, data: issueData(kind, e) });
      const flat = (r: typeof before) => ({ ...(r.data as Record<string, unknown>), date: r.date, status: r.status, jobNo: r.jobNo, productName: r.productName, batchNo: r.batchNo, qtyKg: r.qtyKg });
      await recordChange({ userId: user.id, entityType: ENTITY, entityId: id, action: "updated", message: `${R.label}: edited ${labelOf(e)}`, changes: diff(flat(before), flat(after)) });
    }
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }
  revalidatePath(R.href);
  return { ok: true };
}

export async function deleteRegisterEntry(kind: RegisterKind, id: string): Promise<ActionResult> {
  const user = await requireUser("batchInventory", "edit");
  if (!known(kind)) return { ok: false, error: "Unknown register" };
  const row = await db.inventoryIssue.findFirst({ where: { id, kind: ISSUE_KIND[kind], deletedAt: null } });
  if (!row) return { ok: false, error: "This entry no longer exists." };
  await db.inventoryIssue.update({ where: { id }, data: { deletedAt: new Date() } });
  await recordChange({ userId: user.id, entityType: ENTITY, entityId: id, action: "deleted", message: `${REGISTERS[kind].label}: deleted ${row.productName ?? "entry"}` });
  revalidatePath(REGISTERS[kind].href);
  return { ok: true };
}

/** Lost and Found only: the old "Inventory Loss" sheet → entries and issues. Nothing saved. */
export async function previewRegisterImport(kind: RegisterKind, fd: FormData): Promise<Preview<RegisterEntry>> {
  await requireUser("batchInventory", "edit");
  try {
    if (!known(kind) || !REGISTERS[kind].sheetName) return { ok: false, error: "This register has no sheet import." };
    const file = fd.get("file") as File;
    const { entries, issues } = rowsFromRegisterSheet(kind, pickSheet(await readSheets(file), /loss|lost/i));
    return { ok: true, fileName: file.name, entries, issues };
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }
}

/** Adds the sheet's lines, skipping ones already here (entryKey: job, product, qty, ETD or date, batch). */
export async function importRegister(kind: RegisterKind, input: { mode: "add" | "replace"; fileName: string; entries: RegisterEntry[] }): Promise<ImportResult> {
  const user = await requireUser("batchInventory", "edit");
  if (!known(kind) || !REGISTERS[kind].sheetName) return { ok: false, error: "This register has no sheet import." };
  const list = (Array.isArray(input.entries) ? input.entries : []).map((v) => cleanEntry(kind, v)).filter((e) => e.productName);
  let added = 0;
  try {
    await db.$transaction(
      async (tx) => {
        const have = new Set((await tx.inventoryIssue.findMany({ where: { kind: ISSUE_KIND[kind], deletedAt: null }, select: { entryKey: true } })).map((r) => r.entryKey ?? ""));
        const fresh = list.filter((e) => {
          const k = entryKey(e);
          if (have.has(k)) return false;
          have.add(k);
          return true;
        });
        const created = fresh.length ? await tx.inventoryIssue.createManyAndReturn({ data: fresh.map((e) => issueData(kind, e)), select: { id: true, productName: true } }) : [];
        added = created.length;
        for (const c of created) await recordChange({ userId: user.id, entityType: ENTITY, entityId: c.id, action: "created", message: `${REGISTERS[kind].label}: imported from ${input.fileName} (${c.productName ?? "entry"})` }, tx);
      },
      { timeout: 120_000 },
    );
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }
  revalidatePath(REGISTERS[kind].href);
  return { ok: true, added, skipped: list.length - added, removed: 0 };
}
