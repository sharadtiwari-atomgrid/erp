"use server";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export type HistoryLine = { id: string; at: string; who: string; action: string; message: string; changes: [string, string, string][] };

const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** Per-record history (Activity rows) for the edit dialogs. */
export async function loadHistory(entityType: "BatchInward" | "BatchOutward" | "InventoryIssue", entityId: string): Promise<HistoryLine[]> {
  await requireUser("batchInventory");
  const rows = await db.activity.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { user: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    at: r.updatedAt.toISOString(),
    who: r.user?.name ?? "—",
    action: r.action,
    message: r.message,
    changes: Object.entries((r.changes as Record<string, [unknown, unknown]> | null) ?? {}).map(([k, [a, b]]) => [k, show(a), show(b)]),
  }));
}
