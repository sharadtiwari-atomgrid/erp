import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { dayFromIso } from "@/lib/ops/dates";
import { COLUMN_FIELDS, DATE_FIELD, entryKey, type RegisterEntry, type RegisterKind } from "@/lib/batch-inventory";
import { registerFromRow } from "@/lib/batch-inventory/server";

export const ISSUE_KIND = { "lost-found": "LOST_FOUND", damage: "DAMAGE" } as const;

/** A register entry → InventoryIssue columns (+ the rest in `data`). */
export function issueData(kind: RegisterKind, e: RegisterEntry): Omit<Prisma.InventoryIssueUncheckedCreateInput, "id"> {
  const s = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
  const date = s(e[DATE_FIELD[kind]]);
  const data = Object.fromEntries(Object.entries(e).filter(([k]) => !COLUMN_FIELDS.has(k)));
  return {
    kind: ISSUE_KIND[kind],
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? dayFromIso(date) : null,
    status: s(e.status),
    jobNo: s(e.jobNo),
    productName: s(e.productName),
    batchNo: s(e.batchNo),
    qtyKg: e.qty === null || e.qty === undefined || e.qty === "" ? null : Number(e.qty),
    data: data as Prisma.InputJsonValue,
    entryKey: entryKey(e),
  };
}

export async function loadRegister(kind: RegisterKind) {
  const rows = await db.inventoryIssue.findMany({ where: { kind: ISSUE_KIND[kind], deletedAt: null }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] });
  return rows.map((r) => registerFromRow(kind, r));
}
