"use server";

import { revalidatePath } from "next/cache";
import { recordChange } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { dayFromIso } from "@/lib/ops/dates";
import { parsePSV, parseWarehouseMis, type Psv } from "@/lib/batch-inventory";
import { readSheets } from "../_lib/server";
import { errorText } from "../_lib/types";

export type CountRead = { ok: true; fileName: string; psv: Psv } | { ok: false; error: string };

/**
 * Reads a warehouse stock statement for the comparison: the warehouse MIS (its "Stock in Hand"
 * tab), a PSV sheet or the tracker's Instock tab. Nothing is saved.
 */
export async function readCountFile(fd: FormData): Promise<CountRead> {
  await requireUser("batchInventory");
  try {
    const file = fd.get("file") as File;
    const sheets = await readSheets(file);
    // The warehouse MIS has several tabs; its Stock in Hand tab is the one to compare.
    const sih = Object.keys(sheets).find((n) => /stock\s*in\s*hand/i.test(n));
    const ordered = sih ? { [sih]: sheets[sih], ...sheets } : sheets;
    return { ok: true, fileName: file.name, psv: parsePSV(ordered) };
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }
}

export type MisUpload = { ok: true; message: string } | { ok: false; error: string };

/** The latest warehouse MIS: replaces the WarehouseCount row of kind "warehouse-mis" (used by the daily digest). */
export async function uploadWarehouseMis(fd: FormData): Promise<MisUpload> {
  const user = await requireUser("batchInventory", "edit");
  try {
    const file = fd.get("file") as File;
    const { date, rows } = parseWarehouseMis(await readSheets(file));
    const clean = rows
      .slice(0, 20000)
      .map((r) => ({ name: r.name.slice(0, 200), batch: r.batch.slice(0, 100), received: r.received, dispatched: r.dispatched, closing: r.closing }))
      .filter((r) => r.name);
    if (!clean.length) return { ok: false, error: "The file has no stock lines." };
    const fileName = file.name.slice(0, 200);
    const countDate = date ? dayFromIso(date) : null;
    const before = await db.warehouseCount.findUnique({ where: { kind: "warehouse-mis" }, select: { fileName: true, countDate: true } });
    const saved = await db.warehouseCount.upsert({
      where: { kind: "warehouse-mis" },
      create: { kind: "warehouse-mis", fileName, countDate, rows: clean },
      update: { fileName, countDate, rows: clean, uploadedAt: new Date() },
    });
    await recordChange({
      userId: user.id,
      entityType: "WarehouseCount",
      entityId: saved.id,
      action: before ? "updated" : "created",
      message: `Warehouse MIS uploaded: ${fileName} · stock count ${date ?? "date not found"} · ${clean.length} lines`,
      changes: { fileName: [before?.fileName ?? null, fileName], countDate: [before?.countDate?.toISOString().slice(0, 10) ?? null, date] },
    });
    revalidatePath("/b2b/inventory/stock");
    revalidatePath("/b2b/views/daily-digest");
    return { ok: true, message: `${fileName}: ${clean.length} lines${date ? `, stock count of ${date.split("-").reverse().join("/")}` : " (no date found)"}.` };
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }
}
