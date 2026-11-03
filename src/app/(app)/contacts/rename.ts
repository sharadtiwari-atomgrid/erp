import "server-only";
import { db, type Tx } from "@/lib/db";

/**
 * Domestic B2B records store contact names as text. When a contact is renamed,
 * the new name is written (exact matches of the old name only) onto every
 * record that used it, so reports keep grouping it together.
 */
export type ContactRenameCounts = {
  freshPo: number;
  misJob: number;
  dispatchQuote: number;
  batchOutward: number;
  batchInward: number;
};

export async function renameContactEverywhere(tx: Tx, from: string, to: string): Promise<ContactRenameCounts> {
  // Sequential: queries in one interactive transaction share a connection.
  const poC = await tx.freshPo.updateMany({ where: { customer: from }, data: { customer: to } });
  const poS = await tx.freshPo.updateMany({ where: { supplier: from }, data: { supplier: to } });
  const misC = await tx.misJob.updateMany({ where: { customer: from }, data: { customer: to } });
  const misS = await tx.misJob.updateMany({ where: { supplier: from }, data: { supplier: to } });
  const misT = await tx.misJob.updateMany({ where: { transporterDetails: from }, data: { transporterDetails: to } });
  const dqC = await tx.dispatchQuote.updateMany({ where: { customer: from }, data: { customer: to } });
  const dqS = await tx.dispatchQuote.updateMany({ where: { supplier: from }, data: { supplier: to } });
  const outC = await tx.batchOutward.updateMany({ where: { customer: from }, data: { customer: to } });
  const inS = await tx.batchInward.updateMany({ where: { supplier: from }, data: { supplier: to } });
  return {
    freshPo: poC.count + poS.count,
    misJob: misC.count + misS.count + misT.count,
    dispatchQuote: dqC.count + dqS.count,
    batchOutward: outC.count,
    batchInward: inS.count,
  };
}

export function describeRename(c: ContactRenameCounts): string {
  const parts = [
    [c.misJob, "Domestic MIS job"],
    [c.freshPo, "Fresh PO"],
    [c.dispatchQuote, "D-0 quote"],
    [c.batchInward, "batch inward line"],
    [c.batchOutward, "batch outward line"],
  ] as const;
  const used = parts.filter(([n]) => n > 0).map(([n, l]) => `${n} ${l}${n === 1 ? "" : "s"}`);
  return used.length ? `Renamed on ${used.join(", ")}.` : "The old name wasn't used on any Domestic B2B record.";
}

/** Live (not deleted) Fresh POs and MIS jobs that still use this name. */
export async function liveUsage(name: string) {
  const [po, mis] = await Promise.all([
    db.freshPo.count({ where: { deletedAt: null, OR: [{ customer: name }, { supplier: name }] } }),
    db.misJob.count({ where: { deletedAt: null, OR: [{ customer: name }, { supplier: name }, { transporterDetails: name }] } }),
  ]);
  return { po, mis };
}
