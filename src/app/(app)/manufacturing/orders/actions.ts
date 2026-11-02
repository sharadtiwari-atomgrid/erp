"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ProductionOrderStatus } from "@/generated/prisma/enums";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { warehouseBranchId } from "@/lib/branch";
import { db, type Tx } from "@/lib/db";
import { formatDateTime, num } from "@/lib/format";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { nextDocumentNumber } from "@/lib/sequence";
import { round3 } from "../_lib/bom-math";
import { runAutoSchedule } from "../_lib/run-scheduler";
import {
  attempt,
  clearFutureSlots,
  hasReservation,
  lockOrder,
  MfgError,
  OPEN_BATCH_STATUSES,
  releaseOrderReservation,
  reserveOrderComponents,
  revalidateOrder,
  revalidateStockPages,
} from "../_lib/server";

const orderSchema = z.object({
  productId: f.id("Product"),
  bomId: f.id("BOM"),
  quantity: z.coerce.number({ error: "Quantity must be a number" }).positive("Quantity must be greater than 0"),
  mode: z.enum(["MTS", "MTO", "ATO"], { error: "Choose MTS, MTO or ATO" }),
  warehouseId: f.id("Warehouse"),
  dueDate: f.optionalDate(),
  priority: f.int({ min: 1, label: "Priority" }).max(5, "Priority is 1 (highest) to 5"),
  notes: f.optionalText(),
  salesOrderId: f.optionalText(),
  salesOrderLineId: f.optionalText(),
});

type OrderInput = z.infer<typeof orderSchema>;

/** Checks the BOM and sales order link make sense for the product. */
async function validateOrder(tx: Tx, data: OrderInput) {
  const bom = await tx.bom.findUnique({ where: { id: data.bomId }, select: { productId: true, isActive: true } });
  if (!bom || bom.productId !== data.productId) throw new MfgError("The selected BOM does not belong to this product.");
  if (!bom.isActive) throw new MfgError("The selected BOM is inactive.");
  if (data.salesOrderLineId) {
    const line = await tx.salesOrderLine.findUnique({
      where: { id: data.salesOrderLineId },
      select: { productId: true, salesOrderId: true, salesOrder: { select: { status: true } } },
    });
    if (!line) throw new MfgError("The linked sales order line no longer exists.");
    if (line.productId !== data.productId) throw new MfgError("The product does not match the linked sales order line.");
    if (data.salesOrderId && data.salesOrderId !== line.salesOrderId) throw new MfgError("The sales order line belongs to a different sales order.");
    data.salesOrderId = line.salesOrderId;
  } else if (data.salesOrderId) {
    const so = await tx.salesOrder.count({ where: { id: data.salesOrderId } });
    if (!so) throw new MfgError("The linked sales order no longer exists.");
  }
}

export async function createProductionOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("production", "edit");
  const parsed = parseForm(orderSchema, formData);
  if (!parsed.ok) return parsed.state;
  const data = parsed.data;

  let id = "";
  const result = await attempt(async () => {
    id = await db.$transaction(async (tx) => {
      await validateOrder(tx, data);
      const number = await nextDocumentNumber(tx, "PRODUCTION_ORDER");
      const order = await tx.productionOrder.create({
        data: { ...data, number, branchId: await warehouseBranchId(tx, data.warehouseId) },
      });
      const source = data.salesOrderId ? await tx.salesOrder.findUnique({ where: { id: data.salesOrderId }, select: { number: true } }) : null;
      await logActivity(
        {
          userId: user.id,
          entityType: "ProductionOrder",
          entityId: order.id,
          action: "created",
          message: `Production order ${number} created${source ? ` for sales order ${source.number}` : ""}`,
        },
        tx,
      );
      return order.id;
    });
  });
  if (result?.error) return result;
  revalidateOrder(id);
  if (data.salesOrderId) revalidatePath(`/sales/orders/${data.salesOrderId}`);
  redirect(`/manufacturing/orders/${id}`);
}

export async function updateProductionOrder(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("production", "edit");
  const parsed = parseForm(orderSchema, formData);
  if (!parsed.ok) return parsed.state;
  const data = parsed.data;

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      await validateOrder(tx, data);
      const { count } = await tx.productionOrder.updateMany({
        where: { id, status: "DRAFT" },
        data: { ...data, branchId: await warehouseBranchId(tx, data.warehouseId) },
      });
      if (count === 0) throw new MfgError("Only draft production orders can be edited.");
      const order = await tx.productionOrder.findUniqueOrThrow({ where: { id }, select: { number: true } });
      await logActivity({ userId: user.id, entityType: "ProductionOrder", entityId: id, action: "updated", message: `Production order ${order.number} updated` }, tx);
    }),
  );
  if (result?.error) return result;
  revalidateOrder(id);
  redirect(`/manufacturing/orders/${id}`);
}

const manualScheduleSchema = z
  .object({
    scheduledStart: z.coerce.date({ error: "Enter a start date and time" }),
    scheduledEnd: z.coerce.date({ error: "Enter an end date and time" }),
    reserve: f.checkbox(),
  })
  .refine((d) => d.scheduledEnd > d.scheduledStart, { path: ["scheduledEnd"], message: "End must be after start" });

/** DRAFT → SCHEDULED with manually entered dates (no machine slots). */
export async function scheduleManually(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("production", "edit");
  const parsed = parseForm(manualScheduleSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { scheduledStart, scheduledEnd, reserve } = parsed.data;

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const { count } = await tx.productionOrder.updateMany({
        where: { id, status: "DRAFT" },
        data: { status: "SCHEDULED", scheduledStart, scheduledEnd },
      });
      if (count === 0) throw new MfgError("Only draft orders can be scheduled.");
      const order = await tx.productionOrder.findUniqueOrThrow({ where: { id }, select: { number: true } });
      await logActivity(
        {
          userId: user.id,
          entityType: "ProductionOrder",
          entityId: id,
          action: "scheduled",
          message: `${order.number} scheduled manually ${formatDateTime(scheduledStart)} → ${formatDateTime(scheduledEnd)}`,
        },
        tx,
      );
      if (reserve) await reserveOrderComponents(tx, id, user.id);
    }),
  );
  if (result?.error) return result;
  revalidateOrder(id);
  if (reserve) revalidateStockPages();
  return { success: "Scheduled." };
}

/** Runs the auto-scheduler for this one order against the current calendar. */
export async function autoScheduleOrder(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("production", "edit");
  const reserve = formData.get("reserve") === "on";
  let summary;
  try {
    summary = await runAutoSchedule({ userId: user.id, orderIds: [id] });
  } catch (e) {
    if (e instanceof MfgError) return { error: e.message };
    throw e;
  }
  if (summary.unscheduled.length > 0) return { error: summary.unscheduled[0].reason };
  if (summary.scheduled === 0) return { error: "Only draft or scheduled orders can be auto-scheduled." };
  if (reserve) {
    const result = await attempt(() =>
      db.$transaction(async (tx) => {
        if (!(await hasReservation(tx, id))) await reserveOrderComponents(tx, id, user.id);
      }),
    );
    revalidateOrder(id);
    revalidateStockPages();
    if (result?.error) return { error: `Scheduled, but components were not reserved: ${result.error}` };
  }
  revalidateOrder(id);
  const late = summary.late[0];
  return { success: late ? `Scheduled, but it finishes after the due date (${formatDateTime(late.end)}).` : "Scheduled." };
}

/** SCHEDULED → DRAFT: removes machine slots and releases reservations. */
export async function unscheduleOrder(id: string): Promise<ActionState> {
  const user = await requireUser("production", "edit");
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const { count } = await tx.productionOrder.updateMany({
        where: { id, status: "SCHEDULED" },
        data: { status: "DRAFT", scheduledStart: null, scheduledEnd: null },
      });
      if (count === 0) throw new MfgError("Only scheduled orders that have not started can be unscheduled.");
      await tx.productionScheduleSlot.deleteMany({ where: { productionOrderId: id } });
      await releaseOrderReservation(tx, id, user.id, "unscheduled");
      const order = await tx.productionOrder.findUniqueOrThrow({ where: { id }, select: { number: true } });
      await logActivity({ userId: user.id, entityType: "ProductionOrder", entityId: id, action: "draft", message: `${order.number} unscheduled (back to draft)` }, tx);
    }),
  );
  if (result?.error) return result;
  revalidateOrder(id);
  revalidateStockPages();
  return undefined;
}

export async function reserveComponents(id: string): Promise<ActionState> {
  const user = await requireUser("production", "edit");
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const order = await tx.productionOrder.findUniqueOrThrow({ where: { id }, select: { status: true, updatedAt: true } });
      if (order.status === "COMPLETED" || order.status === "CANCELLED") throw new MfgError("This order is closed.");
      await lockOrder(tx, id, order.updatedAt);
      await reserveOrderComponents(tx, id, user.id);
    }),
  );
  if (result?.error) return result;
  revalidateOrder(id);
  revalidateStockPages();
  return undefined;
}

export async function releaseComponents(id: string): Promise<ActionState> {
  const user = await requireUser("production", "edit");
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const order = await tx.productionOrder.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } });
      await lockOrder(tx, id, order.updatedAt);
      if (!(await hasReservation(tx, id))) throw new MfgError("Nothing is reserved for this order.");
      await releaseOrderReservation(tx, id, user.id, "released manually");
    }),
  );
  if (result?.error) return result;
  revalidateOrder(id);
  revalidateStockPages();
  return undefined;
}

async function closeOrder(
  id: string,
  from: ProductionOrderStatus[],
  to: "COMPLETED" | "CANCELLED",
  check: (tx: Tx) => Promise<void>,
  message: (number: string) => string,
): Promise<ActionState> {
  const user = await requireUser("production", "edit");
  let salesOrderId: string | null = null;
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      await check(tx);
      const { count } = await tx.productionOrder.updateMany({ where: { id, status: { in: from } }, data: { status: to } });
      if (count === 0) throw new MfgError(`This order can no longer be ${to === "COMPLETED" ? "closed" : "cancelled"}.`);
      await releaseOrderReservation(tx, id, user.id, to === "COMPLETED" ? "order closed" : "order cancelled");
      await clearFutureSlots(tx, id);
      const order = await tx.productionOrder.findUniqueOrThrow({ where: { id }, select: { number: true, salesOrderId: true } });
      salesOrderId = order.salesOrderId;
      await logActivity({ userId: user.id, entityType: "ProductionOrder", entityId: id, action: to.toLowerCase(), message: message(order.number) }, tx);
    }),
  );
  if (result?.error) return result;
  revalidateOrder(id);
  revalidateStockPages();
  if (salesOrderId) revalidatePath(`/sales/orders/${salesOrderId}`);
  return undefined;
}

/** IN_PROGRESS → COMPLETED with less than the ordered quantity produced. */
export async function closeOrderShort(id: string): Promise<ActionState> {
  return closeOrder(
    id,
    ["IN_PROGRESS"],
    "COMPLETED",
    async (tx) => {
      const open = await tx.productionBatch.count({ where: { productionOrderId: id, status: { in: [...OPEN_BATCH_STATUSES] } } });
      if (open > 0) throw new MfgError("Finish QC on (or delete) the open batches before closing this order.");
    },
    (n) => `${n} closed short`,
  );
}

/** Cancels an order that has not had any batch through QC. Planned batches are deleted. */
export async function cancelProductionOrder(id: string): Promise<ActionState> {
  return closeOrder(
    id,
    ["DRAFT", "SCHEDULED", "IN_PROGRESS"],
    "CANCELLED",
    async (tx) => {
      const started = await tx.productionBatch.count({ where: { productionOrderId: id, status: { not: "PLANNED" } } });
      if (started > 0) throw new MfgError("Batches have already started on this order, so it cannot be cancelled. Close it short instead.");
      await tx.productionBatch.deleteMany({ where: { productionOrderId: id, status: "PLANNED" } });
      await tx.productionScheduleSlot.deleteMany({ where: { productionOrderId: id } });
    },
    (n) => `${n} cancelled`,
  );
}

const batchSchema = z.object({
  quantity: z.coerce.number({ error: "Quantity must be a number" }).positive("Quantity must be greater than 0"),
});

/** Plans a new batch for an order; quantity cannot exceed what is still to be made. */
export async function createBatch(orderId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("production", "edit");
  const parsed = parseForm(batchSchema, formData);
  if (!parsed.ok) return parsed.state;
  const quantity = round3(parsed.data.quantity);

  let batchId = "";
  const result = await attempt(async () => {
    batchId = await db.$transaction(async (tx) => {
      const order = await tx.productionOrder.findUniqueOrThrow({
        where: { id: orderId },
        select: { number: true, status: true, quantity: true, producedQty: true, updatedAt: true },
      });
      if (order.status === "COMPLETED" || order.status === "CANCELLED") throw new MfgError("This order is closed.");
      await lockOrder(tx, orderId, order.updatedAt);
      const open = await tx.productionBatch.aggregate({
        where: { productionOrderId: orderId, status: { in: [...OPEN_BATCH_STATUSES] } },
        _sum: { quantity: true },
      });
      const remaining = round3(num(order.quantity) - num(order.producedQty) - num(open._sum.quantity));
      if (quantity > remaining) throw new MfgError(`Only ${remaining} remain to be batched on ${order.number}.`);
      const number = await nextDocumentNumber(tx, "PRODUCTION_BATCH");
      const batch = await tx.productionBatch.create({ data: { number, productionOrderId: orderId, quantity } });
      await logActivity(
        { userId: user.id, entityType: "ProductionBatch", entityId: batch.id, action: "created", message: `Batch ${number} of ${quantity} planned on ${order.number}` },
        tx,
      );
      await logActivity({ userId: user.id, entityType: "ProductionOrder", entityId: orderId, action: "batch", message: `Batch ${number} of ${quantity} planned` }, tx);
      return batch.id;
    });
  });
  if (result?.error) return result;
  revalidateOrder(orderId);
  redirect(`/manufacturing/batches/${batchId}`);
}
