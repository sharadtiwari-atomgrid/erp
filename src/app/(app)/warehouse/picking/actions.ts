"use server";

import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import type { ActionState } from "@/lib/forms";
import { nextDocumentNumber } from "@/lib/sequence";
import { attempt, WarehouseError } from "../_lib/errors";
import { recordPicks, undoPicks } from "../_lib/outbound";
import { plural } from "../_lib/qty";
import { revalidateOutbound, revalidateStockPages } from "../_lib/revalidate";

/** Groups PENDING outbound orders of one warehouse into a picking session assigned to a user. */
export async function createPickingSession(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("outbound", "edit");
  const warehouseId = String(formData.get("warehouseId") ?? "");
  const assignedToId = String(formData.get("assignedToId") ?? "") || null;
  const outboundIds = [...new Set(formData.getAll("outboundId").map(String).filter(Boolean))];
  if (!warehouseId) return { error: "Choose a warehouse." };
  if (outboundIds.length === 0) return { error: "Select at least one outbound order." };

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      if (assignedToId) {
        const picker = await tx.user.findFirst({ where: { id: assignedToId, isActive: true }, select: { id: true } });
        if (!picker) throw new WarehouseError("The selected picker is not an active user.");
      }
      const number = await nextDocumentNumber(tx, "PICKING");
      const session = await tx.pickingSession.create({ data: { number, warehouseId, assignedToId } });
      const { count } = await tx.outboundOrder.updateMany({
        where: { id: { in: outboundIds }, warehouseId, status: "PENDING", pickingSessionId: null },
        data: { status: "PICKING", pickingSessionId: session.id },
      });
      if (count !== outboundIds.length) throw new WarehouseError("Some orders are no longer pending in this warehouse. Reload and try again.");

      const outbounds = await tx.outboundOrder.findMany({ where: { id: { in: outboundIds } }, select: { id: true, number: true } });
      await logActivity(
        {
          userId: user.id,
          entityType: "PickingSession",
          entityId: session.id,
          action: "created",
          message: `Picking session ${number} created with ${outbounds.map((o) => o.number).join(", ")}`,
        },
        tx,
      );
      for (const o of outbounds) {
        await logActivity({ userId: user.id, entityType: "OutboundOrder", entityId: o.id, action: "picking", message: `Added to picking session ${number}` }, tx);
      }
      return { session, outboundIds: outbounds.map((o) => o.id) };
    }),
  );
  if (!result.ok) return { error: result.error };

  for (const id of result.value.outboundIds) revalidateOutbound({ id });
  revalidateOutbound({ sessionId: result.value.session.id });
  redirect(`/warehouse/picking/${result.value.session.id}`);
}

/**
 * Saves picks for every order in the session (`pick_<lineId>`, `bin_<lineId>`).
 * With `intent=complete`, orders with picks become PICKED, orders with none go
 * back to PENDING (and leave the session), and the session is completed.
 */
export async function saveSessionPicks(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("outbound", "edit");
  const complete = formData.get("intent") === "complete";

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const session = await tx.pickingSession.findUnique({
        where: { id },
        include: { outbounds: { where: { status: "PICKING" }, select: { id: true } } },
      });
      if (!session) throw new WarehouseError("Picking session not found.");
      if (session.status !== "OPEN") throw new WarehouseError("This session is closed.");
      const ids = session.outbounds.map((o) => o.id);
      const { changed } = await recordPicks(tx, ids, formData);

      if (!complete) {
        if (changed > 0) {
          await logActivity(
            { userId: user.id, entityType: "PickingSession", entityId: id, action: "picks_saved", message: `Picks saved on ${session.number} (${plural(changed, "line")} changed)` },
            tx,
          );
        }
        return { ids, salesOrderIds: [] as string[] };
      }

      const { count } = await tx.pickingSession.updateMany({ where: { id, status: "OPEN" }, data: { status: "COMPLETED", completedAt: new Date() } });
      if (count === 0) throw new WarehouseError("This session is closed.");

      const outbounds = await tx.outboundOrder.findMany({
        where: { id: { in: ids } },
        select: { id: true, number: true, salesOrderId: true, lines: { select: { pickedQty: true } } },
      });
      const picked = outbounds.filter((o) => o.lines.some((l) => Number(l.pickedQty) > 0));
      const empty = outbounds.filter((o) => !picked.includes(o));
      if (picked.length === 0) throw new WarehouseError("Nothing has been picked in this session yet.");

      const now = new Date();
      await tx.outboundOrder.updateMany({ where: { id: { in: picked.map((o) => o.id) }, status: "PICKING" }, data: { status: "PICKED", pickedAt: now } });
      if (empty.length > 0) {
        await tx.outboundOrder.updateMany({ where: { id: { in: empty.map((o) => o.id) }, status: "PICKING" }, data: { status: "PENDING", pickingSessionId: null } });
      }
      for (const o of picked) {
        await logActivity({ userId: user.id, entityType: "OutboundOrder", entityId: o.id, action: "picked", message: `Picked in session ${session.number}` }, tx);
      }
      for (const o of empty) {
        await logActivity(
          { userId: user.id, entityType: "OutboundOrder", entityId: o.id, action: "pending", message: `Nothing picked in ${session.number}; back to pending` },
          tx,
        );
      }
      await logActivity(
        {
          userId: user.id,
          entityType: "PickingSession",
          entityId: id,
          action: "completed",
          message: `Picking session ${session.number} completed: ${plural(picked.length, "order")} picked${empty.length ? `, ${empty.length} returned to pending` : ""}`,
        },
        tx,
      );
      return { ids, salesOrderIds: outbounds.map((o) => o.salesOrderId) };
    }),
  );
  if (!result.ok) return { error: result.error };

  for (const outboundId of result.value.ids) revalidateOutbound({ id: outboundId });
  revalidateOutbound({ sessionId: id });
  revalidateStockPages();
  return { success: complete ? "Session completed." : "Picks saved." };
}

/** Cancels an open session: picks are undone and its orders go back to PENDING. */
export async function cancelPickingSession(id: string): Promise<ActionState> {
  const user = await requireUser("outbound", "edit");
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const { count } = await tx.pickingSession.updateMany({ where: { id, status: "OPEN" }, data: { status: "CANCELLED", completedAt: new Date() } });
      if (count === 0) throw new WarehouseError("Only open sessions can be cancelled.");
      const session = await tx.pickingSession.findUniqueOrThrow({
        where: { id },
        select: { number: true, outbounds: { where: { status: "PICKING" }, select: { id: true, number: true } } },
      });
      for (const o of session.outbounds) {
        await undoPicks(tx, o.id, { reset: true });
        await tx.outboundOrder.update({ where: { id: o.id }, data: { status: "PENDING", pickingSessionId: null } });
        await logActivity(
          { userId: user.id, entityType: "OutboundOrder", entityId: o.id, action: "pending", message: `Picking session ${session.number} cancelled; picks undone` },
          tx,
        );
      }
      await logActivity({ userId: user.id, entityType: "PickingSession", entityId: id, action: "cancelled", message: `Picking session ${session.number} cancelled` }, tx);
      return session.outbounds.map((o) => o.id);
    }),
  );
  if (!result.ok) return { error: result.error };
  for (const outboundId of result.value) revalidateOutbound({ id: outboundId });
  revalidateOutbound({ sessionId: id });
  revalidateStockPages();
  return undefined;
}
