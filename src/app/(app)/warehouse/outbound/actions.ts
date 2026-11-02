"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { HandlingUnitType, type SalesOrderStatus } from "@/generated/prisma/enums";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { warehouseBranchId } from "@/lib/branch";
import { db } from "@/lib/db";
import { formatNumber, num } from "@/lib/format";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { can } from "@/lib/permissions";
import { nextDocumentNumber } from "@/lib/sequence";
import { adjustStock, allocateStock, releaseStock } from "@/lib/stock";
import { takeFromBin } from "../_lib/bins";
import { attempt, WarehouseError } from "../_lib/errors";
import { recordPicks, salesLineRemainders, undoPicks } from "../_lib/outbound";
import { EPSILON, plural, readQty, round3 } from "../_lib/qty";
import { revalidateOutbound, revalidateStockPages } from "../_lib/revalidate";

const log = (userId: string, entityId: string, action: string, message: string) => ({
  userId,
  entityType: "OutboundOrder",
  entityId,
  action,
  message,
});

// ─── Create from a sales order ───────────────────────────────────────────────

/**
 * Creates OUT-xxxxx (PENDING) for part or all of a confirmed sales order. The
 * form posts `qty_<salesOrderLineId>`; each may not exceed what is neither
 * delivered nor already on an open outbound order. Services are not shipped.
 */
export async function createOutbound(salesOrderId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("outbound");
  if (!can(user, "outbound", "edit") && !can(user, "salesOrders", "edit")) redirect("/forbidden");
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const order = await tx.salesOrder.findUnique({
        where: { id: salesOrderId },
        include: { lines: { include: { product: { select: { name: true, type: true } } } } },
      });
      if (!order) throw new WarehouseError("Sales order not found.");
      if (order.status !== "CONFIRMED" && order.status !== "PARTIALLY_DELIVERED") {
        throw new WarehouseError("Only confirmed sales orders can be shipped.");
      }
      const remainders = new Map((await salesLineRemainders(tx, salesOrderId)).map((r) => [r.lineId, r]));

      const lines = [];
      for (const line of order.lines) {
        if (line.product.type === "SERVICE") continue;
        const qty = readQty(formData, `qty_${line.id}`);
        if (qty === null) throw new WarehouseError(`Enter a valid quantity for ${line.product.name}.`);
        if (qty === 0) continue;
        const remainder = remainders.get(line.id)?.remainder ?? 0;
        if (qty > remainder + EPSILON) {
          throw new WarehouseError(`Only ${formatNumber(remainder)} of ${line.product.name} is left to ship; you entered ${formatNumber(qty)}.`);
        }
        lines.push({ salesOrderLineId: line.id, productId: line.productId, quantity: qty });
      }
      if (lines.length === 0) throw new WarehouseError("Enter a quantity on at least one line.");

      const number = await nextDocumentNumber(tx, "OUTBOUND");
      const outbound = await tx.outboundOrder.create({
        data: {
          number,
          salesOrderId,
          warehouseId: order.warehouseId,
          branchId: await warehouseBranchId(tx, order.warehouseId),
          notes,
          lines: { create: lines },
        },
      });
      await logActivity(log(user.id, outbound.id, "created", `Outbound order ${number} created from ${order.number} (${plural(lines.length, "line")})`), tx);
      await logActivity(
        { userId: user.id, entityType: "SalesOrder", entityId: salesOrderId, action: "outbound_created", message: `Outbound order ${number} created` },
        tx,
      );
      return outbound;
    }),
  );
  if (!result.ok) return { error: result.error };

  revalidateOutbound({ id: result.value.id, salesOrderId });
  redirect(`/warehouse/outbound/${result.value.id}`);
}

// ─── Picking (without a session) ─────────────────────────────────────────────

/**
 * Saves picked quantities for one outbound order. With `intent=complete` the
 * order also moves to PICKED. Orders in an open picking session are picked
 * from the session page instead.
 */
export async function savePicks(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("outbound", "edit");
  const complete = formData.get("intent") === "complete";

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const outbound = await tx.outboundOrder.findUnique({
        where: { id },
        select: { number: true, status: true, salesOrderId: true, pickingSession: { select: { number: true, status: true } } },
      });
      if (!outbound) throw new WarehouseError("Outbound order not found.");
      if (outbound.pickingSession?.status === "OPEN") {
        throw new WarehouseError(`${outbound.number} is being picked in session ${outbound.pickingSession.number}.`);
      }
      // Claims the order for picking; also stops a concurrent status change.
      const { count } = await tx.outboundOrder.updateMany({ where: { id, status: { in: ["PENDING", "PICKING"] } }, data: { status: "PICKING" } });
      if (count === 0) throw new WarehouseError("This order is no longer open for picking.");

      const { picked, changed } = await recordPicks(tx, [id], formData);
      if (picked === 0 && !complete) {
        // Nothing picked any more: back to the queue.
        await tx.outboundOrder.update({ where: { id }, data: { status: "PENDING" } });
        if (changed > 0) await logActivity(log(user.id, id, "picks_cleared", `Picks cleared on ${outbound.number}`), tx);
        return outbound.salesOrderId;
      }
      if (outbound.status === "PENDING") await logActivity(log(user.id, id, "picking", `Picking started on ${outbound.number}`), tx);
      if (complete) {
        if (picked === 0) throw new WarehouseError("Pick at least one line before completing picking.");
        await tx.outboundOrder.update({ where: { id }, data: { status: "PICKED", pickedAt: new Date() } });
        await logActivity(log(user.id, id, "picked", `Picking completed on ${outbound.number} (${plural(picked, "line")} picked)`), tx);
      } else if (changed > 0) {
        await logActivity(log(user.id, id, "picks_saved", `Picks saved on ${outbound.number} (${plural(changed, "line")} changed)`), tx);
      }
      return outbound.salesOrderId;
    }),
  );
  if (!result.ok) return { error: result.error };

  revalidateOutbound({ id, salesOrderId: result.value });
  revalidateStockPages();
  return { success: complete ? "Picking completed." : "Picks saved." };
}

// ─── Packing ─────────────────────────────────────────────────────────────────

export async function startPacking(id: string): Promise<ActionState> {
  const user = await requireUser("outbound", "edit");
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const { count } = await tx.outboundOrder.updateMany({ where: { id, status: "PICKED" }, data: { status: "PACKING" } });
      if (count === 0) throw new WarehouseError("Only picked orders can be packed.");
      const outbound = await tx.outboundOrder.findUniqueOrThrow({ where: { id }, select: { number: true } });
      const number = await nextDocumentNumber(tx, "PACKING");
      await tx.packingSession.create({ data: { number, outboundId: id, packedById: user.id } });
      await logActivity(log(user.id, id, "packing", `Packing started on ${outbound.number} (${number})`), tx);
    }),
  );
  if (!result.ok) return { error: result.error };
  revalidateOutbound({ id });
  return undefined;
}

const huSchema = z.object({
  type: z.enum(HandlingUnitType),
  weightKg: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.coerce.number().min(0, "Weight cannot be negative").nullable()),
  dimensions: f.optionalText(),
});

/** Adds a handling unit (box, pallet…) holding `qty_<lineId>` of each line. */
export async function addHandlingUnit(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("outbound", "edit");
  const parsed = parseForm(huSchema, formData);
  if (!parsed.ok) return parsed.state;

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const outbound = await tx.outboundOrder.findUnique({
        where: { id },
        include: { lines: { include: { product: { select: { name: true } } } } },
      });
      if (!outbound) throw new WarehouseError("Outbound order not found.");
      if (outbound.status !== "PACKING") throw new WarehouseError("Start packing before adding handling units.");

      const contents = new Map<string, number>();
      for (const line of outbound.lines) {
        const qty = readQty(formData, `qty_${line.id}`);
        if (qty === null) throw new WarehouseError(`Enter a valid quantity for ${line.product.name}.`);
        if (qty === 0) continue;
        const left = round3(num(line.pickedQty) - num(line.packedQty));
        if (qty > left + EPSILON) throw new WarehouseError(`Only ${formatNumber(left)} of ${line.product.name} is left to pack.`);
        const { count } = await tx.outboundLine.updateMany({
          where: { id: line.id, packedQty: line.packedQty },
          data: { packedQty: { increment: qty } },
        });
        if (count === 0) throw new WarehouseError(`${line.product.name} was packed by someone else. Reload and try again.`);
        contents.set(line.productId, round3((contents.get(line.productId) ?? 0) + qty));
      }
      if (contents.size === 0) throw new WarehouseError("Put at least one item in the handling unit.");

      const code = await nextDocumentNumber(tx, "HANDLING_UNIT");
      await tx.handlingUnit.create({
        data: {
          code,
          outboundId: id,
          ...parsed.data,
          items: { create: [...contents].map(([productId, quantity]) => ({ productId, quantity })) },
        },
      });
      await logActivity(log(user.id, id, "hu_added", `Handling unit ${code} (${parsed.data.type.toLowerCase()}) packed on ${outbound.number}`), tx);
    }),
  );
  if (!result.ok) return { error: result.error };
  revalidateOutbound({ id });
  return { success: "Handling unit added." };
}

/** Removes a handling unit while packing and puts its contents back to "to pack". */
export async function deleteHandlingUnit(id: string, handlingUnitId: string): Promise<ActionState> {
  const user = await requireUser("outbound", "edit");
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const outbound = await tx.outboundOrder.findUnique({ where: { id }, include: { lines: true } });
      if (!outbound) throw new WarehouseError("Outbound order not found.");
      if (outbound.status !== "PACKING") throw new WarehouseError("Handling units can only be removed while packing.");
      const hu = await tx.handlingUnit.findFirst({ where: { id: handlingUnitId, outboundId: id }, include: { items: true } });
      if (!hu) throw new WarehouseError("Handling unit not found.");

      for (const item of hu.items) {
        let left = num(item.quantity);
        for (const line of outbound.lines.filter((l) => l.productId === item.productId)) {
          if (left <= EPSILON) break;
          const take = round3(Math.min(left, num(line.packedQty)));
          if (take <= 0) continue;
          await tx.outboundLine.update({ where: { id: line.id }, data: { packedQty: { decrement: take } } });
          line.packedQty = line.packedQty.minus(take);
          left = round3(left - take);
        }
      }
      await tx.handlingUnit.delete({ where: { id: hu.id } });
      await logActivity(log(user.id, id, "hu_removed", `Handling unit ${hu.code} removed from ${outbound.number}`), tx);
    }),
  );
  if (!result.ok) return { error: result.error };
  revalidateOutbound({ id });
  return undefined;
}

export async function completePacking(id: string): Promise<ActionState> {
  const user = await requireUser("outbound", "edit");
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const outbound = await tx.outboundOrder.findUnique({
        where: { id },
        include: { lines: { include: { product: { select: { name: true } } } }, _count: { select: { handlingUnits: true } } },
      });
      if (!outbound) throw new WarehouseError("Outbound order not found.");
      if (outbound._count.handlingUnits === 0) throw new WarehouseError("Add at least one handling unit.");
      const open = outbound.lines.find((l) => Math.abs(num(l.packedQty) - num(l.pickedQty)) > EPSILON);
      if (open) {
        throw new WarehouseError(
          `${open.product.name}: packed ${formatNumber(open.packedQty)} must equal picked ${formatNumber(open.pickedQty)}.`,
        );
      }
      const now = new Date();
      const { count } = await tx.outboundOrder.updateMany({ where: { id, status: "PACKING" }, data: { status: "PACKED", packedAt: now } });
      if (count === 0) throw new WarehouseError("This order is not being packed.");
      await tx.packingSession.updateMany({ where: { outboundId: id, status: "OPEN" }, data: { status: "COMPLETED", completedAt: now } });
      await logActivity(log(user.id, id, "packed", `${outbound.number} packed in ${plural(outbound._count.handlingUnits, "handling unit")}`), tx);
    }),
  );
  if (!result.ok) return { error: result.error };
  revalidateOutbound({ id });
  return undefined;
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

/**
 * Ships a packed order in one transaction: stock leaves the warehouse
 * (DELIVERY), the reservation and allocation are released, the sales order
 * lines' delivered quantity goes up and the sales order status follows.
 */
export async function dispatchOutbound(id: string): Promise<ActionState> {
  const user = await requireUser("outbound", "edit");
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const { count } = await tx.outboundOrder.updateMany({ where: { id, status: "PACKED" }, data: { status: "DISPATCHED", dispatchedAt: new Date() } });
      if (count === 0) throw new WarehouseError("Only packed orders can be dispatched.");
      const outbound = await tx.outboundOrder.findUniqueOrThrow({
        where: { id },
        include: {
          salesOrder: { select: { id: true, number: true } },
          lines: { include: { product: { select: { name: true } }, salesOrderLine: { select: { quantity: true, reservedQty: true } } } },
        },
      });

      let shipped = 0;
      for (const line of outbound.lines) {
        const qty = num(line.pickedQty);
        if (qty <= 0) continue;
        shipped++;
        await adjustStock(tx, {
          productId: line.productId,
          warehouseId: outbound.warehouseId,
          quantity: -qty,
          type: "DELIVERY",
          referenceType: "OutboundOrder",
          referenceId: id,
          reference: outbound.number,
          note: `For ${outbound.salesOrder.number}`,
          userId: user.id,
        });
        if (line.binId) await takeFromBin(tx, { binId: line.binId, productId: line.productId, quantity: qty });
        await allocateStock(tx, { productId: line.productId, warehouseId: outbound.warehouseId, quantity: -qty });

        if (line.salesOrderLineId && line.salesOrderLine) {
          const release = round3(Math.min(num(line.salesOrderLine.reservedQty), qty));
          if (release > 0) {
            await releaseStock(tx, { productId: line.productId, warehouseId: outbound.warehouseId, quantity: release });
          }
          const ordered = num(line.salesOrderLine.quantity);
          const { count: updated } = await tx.salesOrderLine.updateMany({
            where: { id: line.salesOrderLineId, deliveredQty: { lte: round3(ordered - qty + EPSILON) }, reservedQty: { gte: round3(release - EPSILON) } },
            data: { deliveredQty: { increment: qty }, reservedQty: { decrement: release } },
          });
          if (updated === 0) throw new WarehouseError(`${line.product.name} would exceed the ordered quantity on ${outbound.salesOrder.number}.`);
        }
      }
      if (shipped === 0) throw new WarehouseError("Nothing was picked on this order.");

      // Sales order status: delivered once every goods line is fully delivered.
      const soLines = await tx.salesOrderLine.findMany({
        where: { salesOrderId: outbound.salesOrderId },
        select: { id: true, quantity: true, deliveredQty: true, product: { select: { type: true } } },
      });
      const goods = soLines.filter((l) => l.product.type === "GOODS");
      const complete = goods.every((l) => num(l.deliveredQty) + EPSILON >= num(l.quantity));
      const status: SalesOrderStatus = complete ? "DELIVERED" : "PARTIALLY_DELIVERED";
      if (complete) {
        // Services ride along with the goods: mark them delivered with the last shipment.
        for (const l of soLines.filter((s) => s.product.type === "SERVICE")) {
          await tx.salesOrderLine.update({ where: { id: l.id }, data: { deliveredQty: l.quantity } });
        }
      }
      await tx.salesOrder.updateMany({
        where: { id: outbound.salesOrderId, status: { in: ["CONFIRMED", "PARTIALLY_DELIVERED"] } },
        data: { status },
      });

      await logActivity(log(user.id, id, "dispatched", `${outbound.number} dispatched (${plural(shipped, "line")})`), tx);
      await logActivity(
        {
          userId: user.id,
          entityType: "SalesOrder",
          entityId: outbound.salesOrderId,
          action: "delivered",
          message: `${outbound.number} dispatched; ${outbound.salesOrder.number} now ${complete ? "fully delivered" : "partially delivered"}`,
        },
        tx,
      );
      return { salesOrderId: outbound.salesOrderId, productIds: outbound.lines.map((l) => l.productId), sessionId: outbound.pickingSessionId };
    }),
  );
  if (!result.ok) return { error: result.error };
  revalidateOutbound({ id, salesOrderId: result.value.salesOrderId, sessionId: result.value.sessionId });
  revalidateStockPages(result.value.productIds);
  return undefined;
}

// ─── Cancel ──────────────────────────────────────────────────────────────────

/** Cancels an outbound order before dispatch and de-allocates what was picked. Reservations stay with the sales order. */
export async function cancelOutbound(id: string): Promise<ActionState> {
  const user = await requireUser("outbound", "edit");
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const { count } = await tx.outboundOrder.updateMany({
        where: { id, status: { in: ["PENDING", "PICKING", "PICKED", "PACKING", "PACKED"] } },
        data: { status: "CANCELLED" },
      });
      if (count === 0) throw new WarehouseError("Dispatched or cancelled orders cannot be cancelled.");
      const outbound = await tx.outboundOrder.findUniqueOrThrow({ where: { id }, select: { number: true, salesOrderId: true, pickingSessionId: true } });
      await undoPicks(tx, id, { reset: false });
      await tx.packingSession.updateMany({ where: { outboundId: id, status: "OPEN" }, data: { status: "CANCELLED", completedAt: new Date() } });
      await logActivity(log(user.id, id, "cancelled", `Outbound order ${outbound.number} cancelled`), tx);
      await logActivity(
        { userId: user.id, entityType: "SalesOrder", entityId: outbound.salesOrderId, action: "outbound_cancelled", message: `Outbound order ${outbound.number} cancelled` },
        tx,
      );
      return outbound;
    }),
  );
  if (!result.ok) return { error: result.error };
  revalidateOutbound({ id, salesOrderId: result.value.salesOrderId, sessionId: result.value.pickingSessionId });
  revalidateStockPages();
  return undefined;
}
