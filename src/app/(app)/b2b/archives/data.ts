import "server-only";
import { recordChange } from "@/lib/audit";
import { db } from "@/lib/db";
import { deleteStoredFile } from "@/lib/storage";

/** Deleted Fresh POs and Domestic MIS jobs stay recoverable this long. */
export const ARCHIVE_DAYS = 3;
const ARCHIVE_MS = ARCHIVE_DAYS * 86_400_000;

export type ArchiveKind = "FreshPo" | "MisJob";

/** Removes a record for good, with its documents. */
export async function destroy(kind: ArchiveKind, id: string, userId: string | null, message: string) {
  const files = await db.opsFile.findMany({ where: { entityType: kind, entityId: id }, select: { id: true, storageKey: true } });
  await db.$transaction(async (tx) => {
    await tx.opsFile.deleteMany({ where: { id: { in: files.map((f) => f.id) } } });
    if (kind === "FreshPo") await tx.freshPo.deleteMany({ where: { id, deletedAt: { not: null } } });
    else await tx.misJob.deleteMany({ where: { id, deletedAt: { not: null } } });
    await recordChange({ userId, entityType: kind, entityId: id, action: "purged", message }, tx);
  });
  for (const f of files) if (f.storageKey) await deleteStoredFile(f.storageKey);
}

/** Purges everything deleted more than ARCHIVE_DAYS ago. */
export async function purgeExpired() {
  const cutoff = new Date(Date.now() - ARCHIVE_MS);
  const [pos, jobs] = await Promise.all([
    db.freshPo.findMany({ where: { deletedAt: { lt: cutoff } }, select: { id: true } }),
    db.misJob.findMany({ where: { deletedAt: { lt: cutoff } }, select: { id: true } }),
  ]);
  for (const p of pos) await destroy("FreshPo", p.id, null, `Removed after ${ARCHIVE_DAYS} days in Archives`);
  for (const j of jobs) await destroy("MisJob", j.id, null, `Removed after ${ARCHIVE_DAYS} days in Archives`);
}

/** "2d 5h left", "3h 10m left"… */
export function timeLeft(deletedAt: Date, now: number = Date.now()): string {
  const ms = deletedAt.getTime() + ARCHIVE_MS - now;
  if (ms <= 0) return "expiring…";
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  if (days >= 1) return `${days}d ${hours}h left`;
  const mins = Math.floor((ms % 3_600_000) / 60_000);
  return hours >= 1 ? `${hours}h ${mins}m left` : `${mins}m left`;
}
