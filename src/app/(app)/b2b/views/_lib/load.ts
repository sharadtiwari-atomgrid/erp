import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { toFpoRow, toMisRow, type FpoRow, type MisRow } from "./rows";

/** Live (not deleted) Domestic MIS jobs with their document file names. */
export async function loadMisRows(where: Prisma.MisJobWhereInput = {}): Promise<MisRow[]> {
  const jobs = await db.misJob.findMany({ where: { deletedAt: null, ...where }, orderBy: { createdAt: "asc" } });
  if (!jobs.length) return [];
  const files = await db.opsFile.findMany({
    where: { entityType: "MisJob", entityId: { in: jobs.map((j) => j.id) } },
    select: { entityId: true, field: true, fileName: true },
    orderBy: { createdAt: "asc" },
  });
  const byJob = new Map<string, Array<{ field: string; fileName: string }>>();
  for (const f of files) {
    const list = byJob.get(f.entityId) ?? [];
    list.push(f);
    byJob.set(f.entityId, list);
  }
  return jobs.map((j) => toMisRow(j, byJob.get(j.id)));
}

/** Live Fresh POs on every board (Fresh, Long Hold and the ones moved to MIS). */
export async function loadFpoRows(): Promise<FpoRow[]> {
  const pos = await db.freshPo.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "asc" } });
  return pos.map(toFpoRow);
}
