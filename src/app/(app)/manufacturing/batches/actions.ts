"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { BatchStatus } from "@/generated/prisma/enums";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db, type Tx } from "@/lib/db";
import { formatNumber, num } from "@/lib/format";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { adjustStock, releaseStock } from "@/lib/stock";
import { bomCostRollup, componentRequirement, round3 } from "../_lib/bom-math";
import {
  attempt,
  clearFutureSlots,
  consumedBatchQty,
  hasReservation,
  MfgError,
  releaseOrderReservation,
  reservedRemaining,
  revalidateOrder,
  revalidateStockPages,
} from "../_lib/server";

function revalidateBatch(id: string, orderId: string) {
  revalidatePath("/manufacturing/batches");
  revalidatePath(`/manufacturing/batches/${id}`);
  revalidateOrder(orderId);
}

async function log(tx: Tx, userId: string, batch: { id: string; number: string; productionOrderId: string }, action: string, message: string) {
  await logActivity({ userId, entityType: "ProductionBatch", entityId: batch.id, action, message }, tx);
  await logActivity({ userId, entityType: "ProductionOrder", entityId: batch.productionOrderId, action: `batch_${action}`, message }, tx);
}

/** PLANNED → IN_PROGRESS. The order moves to IN_PROGRESS with its first started batch. */
export async function startBatch(id: string): Promise<ActionState> {
  const user = await requireUser("production", "edit");
  let orderId = "";
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const { count } = await tx.productionBatch.updateMany({
        where: { id, status: "PLANNED", productionOrder: { status: { in: ["DRAFT", "SCHEDULED", "IN_PROGRESS"] } } },
        data: { status: "IN_PROGRESS", startedAt: new Date() },
      });
      if (count === 0) throw new MfgError("This batch can no longer be started.");
      const batch = await tx.productionBatch.findUniqueOrThrow({ where: { id }, select: { id: true, number: true, productionOrderId: true } });
      orderId = batch.productionOrderId;
      await log(tx, user.id, batch, "started", `Batch ${batch.number} started`);
      const moved = await tx.productionOrder.updateMany({ where: { id: orderId, status: { in: ["DRAFT", "SCHEDULED"] } }, data: { status: "IN_PROGRESS" } });
      if (moved.count > 0) {
        const order = await tx.productionOrder.findUniqueOrThrow({ where: { id: orderId }, select: { number: true } });
        await logActivity({ userId: user.id, entityType: "ProductionOrder", entityId: orderId, action: "in_progress", message: `${order.number} in progress` }, tx);
      }
    }),
  );
  if (result?.error) return result;
  revalidateBatch(id, orderId);
  return undefined;
}

/** IN_PROGRESS → QC_PENDING. */
export async function finishBatch(id: string): Promise<ActionState> {
  const user = await requireUser("production", "edit");
  let orderId = "";
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const { count } = await tx.productionBatch.updateMany({ where: { id, status: "IN_PROGRESS" }, data: { status: "QC_PENDING", completedAt: new Date() } });
      if (count === 0) throw new MfgError("Only batches in progress can be finished.");
      const batch = await tx.productionBatch.findUniqueOrThrow({ where: { id }, select: { id: true, number: true, productionOrderId: true } });
      orderId = batch.productionOrderId;
      await log(tx, user.id, batch, "qc_pending", `Batch ${batch.number} finished; awaiting QC`);
    }),
  );
  if (result?.error) return result;
  revalidateBatch(id, orderId);
  return undefined;
}

export async function deleteBatch(id: string): Promise<ActionState> {
  const user = await requireUser("production", "edit");
  let orderId = "";
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const batch = await tx.productionBatch.findUnique({ where: { id }, select: { id: true, number: true, productionOrderId: true } });
      if (!batch) throw new MfgError("Batch not found.");
      const { count } = await tx.productionBatch.deleteMany({ where: { id, status: "PLANNED" } });
      if (count === 0) throw new MfgError("Only planned batches can be deleted.");
      orderId = batch.productionOrderId;
      await logActivity({ userId: user.id, entityType: "ProductionOrder", entityId: orderId, action: "batch_deleted", message: `Planned batch ${batch.number} deleted` }, tx);
    }),
  );
  if (result?.error) return result;
  revalidateOrder(orderId);
  revalidatePath("/manufacturing/batches");
  redirect(`/manufacturing/orders/${orderId}`);
}

const qcSchema = z.object({
  passedQty: f.number({ label: "Passed quantity" }),
  failedQty: f.number({ label: "Failed quantity" }),
  qcNotes: f.optionalText(),
});

/**
 * Records batch QC and posts stock in one transaction:
 *  - consumes components for the whole batch (BOM-proportional, incl. scrap),
 *  - releases the matching component reservations,
 *  - receives the passed quantity of the finished good,
 *  - adds it to the order's producedQty and completes the order when done.
 */
export async function recordBatchQc(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("production", "edit");
  const parsed = parseForm(qcSchema, formData);
  if (!parsed.ok) return parsed.state;
  const passedQty = round3(parsed.data.passedQty);
  const failedQty = round3(parsed.data.failedQty);

  let orderId = "";
  const result = await attempt(() =>
    db.$transaction(
      async (tx) => {
        const batch = await tx.productionBatch.findUnique({
          where: { id },
          include: {
            productionOrder: {
              include: {
                product: { select: { name: true } },
                bom: {
                  include: {
                    lines: { include: { component: { select: { purchasePrice: true } } } },
                    operations: { include: { machine: { select: { hourlyCost: true } } } },
                  },
                },
              },
            },
          },
        });
        if (!batch) throw new MfgError("Batch not found.");
        const order = batch.productionOrder;
        orderId = order.id;
        const batchQty = num(batch.quantity);
        if (round3(passedQty + failedQty) !== round3(batchQty)) {
          throw new MfgError(`Passed + failed must equal the batch quantity (${formatNumber(batchQty)}).`);
        }
        const status: BatchStatus = failedQty === 0 ? "PASSED" : passedQty === 0 ? "FAILED" : "PARTIALLY_PASSED";

        // Guarded transition: a second click finds the batch no longer QC_PENDING.
        const { count } = await tx.productionBatch.updateMany({
          where: { id, status: "QC_PENDING" },
          data: { status, passedQty, failedQty, qcNotes: parsed.data.qcNotes, qcAt: new Date() },
        });
        if (count === 0) throw new MfgError("QC has already been recorded for this batch, or it is not finished yet.");
        if (order.status !== "IN_PROGRESS") throw new MfgError(`Order ${order.number} is ${order.status.toLowerCase()}; QC cannot be posted.`);

        // What is still held in reservation for this order before this batch,
        // so we never release more than this order reserved.
        const stillReserved = (await hasReservation(tx, order.id))
          ? reservedRemaining(order.bom, num(order.quantity), round3((await consumedBatchQty(tx, order.id)) - batchQty))
          : new Map<string, number>();
        const outputQty = num(order.bom.outputQty);
        const ref = { referenceType: "ProductionBatch", referenceId: batch.id, reference: batch.number, userId: user.id };

        for (const line of order.bom.lines) {
          const qty = componentRequirement(num(line.quantity), num(line.scrapPct), outputQty, batchQty);
          if (qty <= 0) continue;
          await adjustStock(tx, {
            ...ref,
            productId: line.componentId,
            warehouseId: order.warehouseId,
            quantity: -qty,
            type: "PRODUCTION_OUT",
            unitCost: num(line.component.purchasePrice),
            note: `Consumed for ${order.number}`,
          });
          const release = Math.min(qty, stillReserved.get(line.componentId) ?? 0);
          if (release > 0) {
            await releaseStock(tx, { productId: line.componentId, warehouseId: order.warehouseId, quantity: release });
            stillReserved.set(line.componentId, round3((stillReserved.get(line.componentId) ?? 0) - release));
          }
        }

        if (passedQty > 0) {
          const rollup = bomCostRollup({
            outputQty,
            lines: order.bom.lines.map((l) => ({ quantity: num(l.quantity), scrapPct: num(l.scrapPct), unitCost: num(l.component.purchasePrice) })),
            operations: order.bom.operations.map((o) => ({ setupHours: num(o.setupHours), runHoursPerUnit: num(o.runHoursPerUnit), hourlyCost: num(o.machine?.hourlyCost) })),
          });
          await adjustStock(tx, {
            ...ref,
            productId: order.productId,
            warehouseId: order.warehouseId,
            quantity: passedQty,
            type: "PRODUCTION_IN",
            unitCost: rollup.perUnit,
            note: `Produced on ${order.number}`,
          });
        }

        const updated = await tx.productionOrder.update({
          where: { id: order.id },
          data: { producedQty: { increment: passedQty } },
          select: { producedQty: true, quantity: true },
        });
        await log(
          tx,
          user.id,
          batch,
          status.toLowerCase(),
          `Batch ${batch.number} QC ${status === "PASSED" ? "passed" : status === "FAILED" ? "failed" : "partially passed"}: ${formatNumber(passedQty)} passed, ${formatNumber(failedQty)} failed`,
        );

        if (num(updated.producedQty) >= num(updated.quantity)) {
          const { count: done } = await tx.productionOrder.updateMany({ where: { id: order.id, status: "IN_PROGRESS" }, data: { status: "COMPLETED" } });
          if (done > 0) {
            await releaseOrderReservation(tx, order.id, user.id, "order completed");
            await clearFutureSlots(tx, order.id);
            await logActivity(
              { userId: user.id, entityType: "ProductionOrder", entityId: order.id, action: "completed", message: `${order.number} completed (${formatNumber(updated.producedQty)} produced)` },
              tx,
            );
          }
        }
      },
      { timeout: 20_000 },
    ),
  );
  if (result?.error) return result;
  revalidateBatch(id, orderId);
  revalidateStockPages();
  return { success: "QC recorded and stock posted." };
}
