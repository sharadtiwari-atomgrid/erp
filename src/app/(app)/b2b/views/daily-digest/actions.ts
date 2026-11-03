"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { requireUser } from "@/lib/auth";
import { recordChange } from "@/lib/audit";
import { db } from "@/lib/db";
import type { ActionState } from "@/lib/forms";
import { dayFromIso, formatDmy } from "@/lib/ops/dates";
import { parseWarehouseMis } from "@/lib/batch-inventory";

const MAX_BYTES = 25 * 1024 * 1024;

/** Reads the warehouse MIS workbook and replaces the saved one (WarehouseCount kind "warehouse-mis"). */
export async function uploadWarehouseMis(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("batchInventory", "edit");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the warehouse MIS file." };
  if (file.size > MAX_BYTES) return { error: "That file is over 25 MB." };

  let parsed: ReturnType<typeof parseWarehouseMis>;
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const sheets = Object.fromEntries(
      wb.SheetNames.map((name) => [name, XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: "" })]),
    );
    parsed = parseWarehouseMis(sheets);
  } catch (e) {
    return { error: `Couldn't read that file: ${e instanceof Error ? e.message : String(e)}` };
  }

  const data = {
    fileName: file.name,
    countDate: parsed.date ? dayFromIso(parsed.date) : null,
    rows: parsed.rows as unknown as object,
    uploadedAt: new Date(),
  };
  const saved = await db.warehouseCount.upsert({ where: { kind: "warehouse-mis" }, create: { kind: "warehouse-mis", ...data }, update: data });
  await recordChange({
    userId: user.id,
    entityType: "WarehouseCount",
    entityId: saved.id,
    action: "uploaded",
    message: `Warehouse MIS ${file.name} uploaded (${parsed.rows.length} lines, stock count ${parsed.date ? formatDmy(parsed.date) : "date not found"})`,
  });
  revalidatePath("/b2b/views/daily-digest");
  return { success: `Warehouse MIS loaded — ${parsed.rows.length} lines, stock count ${parsed.date ? formatDmy(parsed.date) : "date not found"}.` };
}
