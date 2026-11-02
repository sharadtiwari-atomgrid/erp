import "server-only";
import { db, type Tx } from "@/lib/db";

/** Field values that changed: { field: [old, new] }. Bookkeeping fields are ignored. */
export type Changes = Record<string, [unknown, unknown]>;

const SKIP = new Set(["id", "createdAt", "updatedAt", "deletedAt"]);

function norm(v: unknown): string {
  if (v === undefined || v === null || v === "") return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && v !== null && "toFixed" in v) return String(Number(v)); // Prisma Decimal
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function plain(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object" && v !== null && "toFixed" in v) return Number(v);
  return v ?? null;
}

/** Field-level diff between two versions of a record. */
export function diff(before: Record<string, unknown> | null | undefined, after: Record<string, unknown> | null | undefined): Changes {
  const out: Changes = {};
  for (const key of new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])) {
    if (SKIP.has(key)) continue;
    if (norm(before?.[key]) !== norm(after?.[key])) out[key] = [plain(before?.[key]), plain(after?.[key])];
  }
  return out;
}

const MERGE_WINDOW_MS = 10 * 60_000;

/**
 * Logs a change to a record with its field-level diff. Repeated "updated"
 * entries on the same record by the same person within 10 minutes are merged
 * into one line (keeping the first old value and the latest new value); if the
 * edits cancel out, the line is removed. Never throws: logging must not block a save.
 */
export async function recordChange(
  input: { userId?: string | null; entityType: string; entityId: string; action: string; message: string; changes?: Changes },
  tx: Tx | typeof db = db,
) {
  try {
    const changes = input.changes ?? {};
    if (input.action === "updated") {
      if (Object.keys(changes).length === 0) return;
      const recent = await tx.activity.findFirst({
        where: {
          entityType: input.entityType,
          entityId: input.entityId,
          userId: input.userId ?? null,
          action: "updated",
          updatedAt: { gte: new Date(Date.now() - MERGE_WINDOW_MS) },
        },
        orderBy: { updatedAt: "desc" },
      });
      if (recent) {
        const merged: Changes = { ...((recent.changes as Changes | null) ?? {}) };
        for (const [field, [oldValue, newValue]] of Object.entries(changes)) {
          const first = merged[field] ? merged[field][0] : oldValue;
          if (norm(first) === norm(newValue)) delete merged[field];
          else merged[field] = [first, newValue];
        }
        if (Object.keys(merged).length === 0) await tx.activity.delete({ where: { id: recent.id } });
        else await tx.activity.update({ where: { id: recent.id }, data: { changes: merged as object, message: input.message } });
        return;
      }
    }
    await tx.activity.create({
      data: {
        userId: input.userId ?? null,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        message: input.message,
        changes: Object.keys(changes).length ? (changes as object) : undefined,
      },
    });
  } catch (error) {
    console.error("recordChange failed", error);
  }
}
