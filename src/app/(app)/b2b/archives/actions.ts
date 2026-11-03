"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { recordChange } from "@/lib/audit";
import type { ActionState } from "@/lib/forms";
import { jobNoTaken, nextJobNo, nextRequestNo, withSerial } from "@/lib/ops/serials";
import { can } from "@/lib/permissions";
import { destroy, type ArchiveKind } from "./data";

function refresh() {
  revalidatePath("/b2b/archives");
  revalidatePath("/b2b/fresh-po");
  revalidatePath("/b2b/long-hold");
  revalidatePath("/b2b/mis");
}

/** Restores a Fresh PO. Its number may have gone to another PO on its board meanwhile; then it takes the next one. */
export async function restoreFreshPo(id: string): Promise<ActionState> {
  const user = await requireUser("b2bOrders", "edit");
  const result = await withSerial("board", async (tx) => {
    const po = await tx.freshPo.findFirst({ where: { id, deletedAt: { not: null } } });
    if (!po) return null;
    // A PO whose Domestic MIS job is gone goes back to the Fresh PO board.
    const board = po.board === "MIS" && !po.misJobId ? "FRESH" : po.board;
    let requestNo = po.requestNo;
    if (board !== "MIS") {
      const taken =
        requestNo === null ||
        board !== po.board ||
        !!(await tx.freshPo.findFirst({ where: { board, requestNo, deletedAt: null, NOT: { id } }, select: { id: true } }));
      if (taken) requestNo = await nextRequestNo(tx, board);
    }
    await tx.freshPo.update({ where: { id }, data: { deletedAt: null, board, requestNo } });
    await recordChange(
      {
        userId: user.id,
        entityType: "FreshPo",
        entityId: id,
        action: "restored",
        message: "Restored from Archives",
        changes: requestNo !== po.requestNo || board !== po.board ? { requestNo: [po.requestNo, requestNo], board: [po.board, board] } : undefined,
      },
      tx,
    );
    return { requestNo, renumbered: requestNo !== po.requestNo };
  });
  if (!result) return { error: "This PO is no longer in Archives." };
  refresh();
  return { success: `Restored as PO #${result.requestNo ?? "—"}${result.renumbered ? " (its old number was taken)" : ""}.` };
}

/** Restores a Domestic MIS job; a new Job No. when its old one is now used by another live job. */
export async function restoreMisJob(id: string): Promise<ActionState> {
  const user = await requireUser("b2bOrders", "edit");
  const result = await withSerial("mis", async (tx) => {
    const job = await tx.misJob.findFirst({ where: { id, deletedAt: { not: null } } });
    if (!job) return null;
    const jobNo = (await jobNoTaken(tx, job.jobNo, id)) ? await nextJobNo(tx) : job.jobNo;
    await tx.misJob.update({ where: { id }, data: { deletedAt: null, jobNo } });
    await recordChange(
      {
        userId: user.id,
        entityType: "MisJob",
        entityId: id,
        action: "restored",
        message: "Restored from Archives",
        changes: jobNo !== job.jobNo ? { jobNo: [job.jobNo, jobNo] } : undefined,
      },
      tx,
    );
    return { jobNo, renumbered: jobNo !== job.jobNo };
  });
  if (!result) return { error: "This job is no longer in Archives." };
  refresh();
  return { success: `Restored as Job ${result.jobNo}${result.renumbered ? " (its old number was taken)" : ""}.` };
}

/** Permanent delete, for users who may edit settings. */
export async function deleteForever(kind: ArchiveKind, id: string): Promise<ActionState> {
  const user = await requireUser("b2bOrders", "edit");
  if (!can(user, "settings", "edit")) return { error: "Only an administrator can delete permanently." };
  if (kind !== "FreshPo" && kind !== "MisJob") return { error: "Unknown record." };
  await destroy(kind, id, user.id, "Removed permanently from Archives");
  refresh();
  return { success: "Deleted permanently." };
}
