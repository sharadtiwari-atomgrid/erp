import "server-only";
import { diff, recordChange } from "@/lib/audit";
import { db, type Tx } from "@/lib/db";
import { dayFromIso, formatDmy } from "@/lib/ops/dates";
import type { DispatchQuote, MisJob } from "@/generated/prisma/client";
import { TX_SLOTS, backfill, blankBid, fromMis } from "./board";

const nullIfBlank = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v || null]));

/**
 * Today's jobs (MIS Actual ETD = today, IST) get a board row if they have none
 * yet (source "planned-today"; unique on job + day), and blank cells on their
 * rows are filled from the MIS job. Returns the row shown for each job.
 */
export async function prepareBoard(client: Tx | typeof db, jobs: MisJob[], today: string, userId: string): Promise<Map<string, DispatchQuote>> {
  const jobNos = [...new Set(jobs.map((j) => j.jobNo.trim()).filter(Boolean))];
  if (!jobNos.length) return new Map();
  const existing = await client.dispatchQuote.findMany({ where: { jobNo: { in: jobNos } }, orderBy: { plannedFor: "desc" } });
  const have = new Set(existing.map((q) => q.jobNo));
  const missing = jobs.filter((j, i) => j.jobNo.trim() && !have.has(j.jobNo.trim()) && jobs.findIndex((x) => x.jobNo.trim() === j.jobNo.trim()) === i);
  if (missing.length) {
    const plannedFor = dayFromIso(today);
    await client.dispatchQuote.createMany({
      data: missing.map((j) => ({ jobNo: j.jobNo.trim(), plannedFor, source: "planned-today", ...nullIfBlank(fromMis(j)), bids: TX_SLOTS.map(blankBid), vehicleStages: [] })),
      skipDuplicates: true,
    });
    const created = await client.dispatchQuote.findMany({ where: { jobNo: { in: missing.map((j) => j.jobNo.trim()) }, plannedFor } });
    for (const q of created) {
      await recordChange(
        {
          userId,
          entityType: "DispatchQuote",
          entityId: q.id,
          action: "created",
          message: `Job ${q.jobNo} added to the D-0 quotation sheet for ${formatDmy(today)} (dispatching today in Domestic MIS)`,
        },
        client,
      );
    }
    existing.push(...created);
  }

  // The latest row per job, its blanks filled from MIS.
  const byJob = new Map<string, DispatchQuote>();
  for (const q of existing.sort((a, b) => b.plannedFor.getTime() - a.plannedFor.getTime())) if (!byJob.has(q.jobNo)) byJob.set(q.jobNo, q);
  for (const j of jobs) {
    const q = byJob.get(j.jobNo.trim());
    if (!q) continue;
    const patch = backfill(q, j);
    if (!Object.keys(patch).length) continue;
    const after = await client.dispatchQuote.update({ where: { id: q.id }, data: patch });
    await recordChange(
      {
        userId,
        entityType: "DispatchQuote",
        entityId: q.id,
        action: "updated",
        message: `D-0 quotation for job ${q.jobNo}: blanks filled from Domestic MIS`,
        changes: diff(q, after),
      },
      client,
    );
    byJob.set(q.jobNo, after);
  }
  return byJob;
}

