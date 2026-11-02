"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { PurchaseOrderStatus } from "@/generated/prisma/enums";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db, type Tx } from "@/lib/db";
import { formatNumber, num } from "@/lib/format";
import { f, parseForm, parseLines, type ActionState } from "@/lib/forms";
import { nextDocumentNumber } from "@/lib/sequence";
import { adjustStock } from "@/lib/stock";
import { computeDocument } from "@/lib/totals";
import { canReceiveGoods } from "../_components/access";

/** Thrown inside a transaction to roll it back and show the message to the user. */
class OrderError extends Error {}

const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

const orderSchema = z
  .object({
    supplierId: f.id("Supplier"),
    warehouseId: f.id("Receiving warehouse"),
    orderDate: f.date(),
    expectedDate: f.optionalDate(),
    notes: f.optionalText(),
  })
  .refine((d) => !d.expectedDate || d.expectedDate >= d.orderDate, {
    path: ["expectedDate"],
    message: "Expected date cannot be before the order date",
  });

function revalidateOrder(id: string, supplierId?: string) {
  revalidatePath("/purchasing/orders");
  revalidatePath(`/purchasing/orders/${id}`);
  if (supplierId) revalidatePath(`/purchasing/suppliers/${supplierId}`);
}

export async function createPurchaseOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("purchaseOrders", "edit");
  const parsed = parseForm(orderSchema, formData);
  if (!parsed.ok) return parsed.state;
  const lines = parseLines(formData);
  if (!lines.ok) return lines.state;
  const doc = computeDocument(lines.lines);

  const order = await db.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, "PURCHASE_ORDER");
    const created = await tx.purchaseOrder.create({
      data: {
        ...parsed.data,
        number,
        subtotal: doc.subtotal,
        taxTotal: doc.taxTotal,
        total: doc.total,
        lines: { create: doc.lines },
      },
    });
    await logActivity(
      { userId: user.id, entityType: "PurchaseOrder", entityId: created.id, action: "created", message: `Purchase order ${number} created` },
      tx,
    );
    return created;
  });

  revalidateOrder(order.id, order.supplierId);
  redirect(`/purchasing/orders/${order.id}`);
}

export async function updatePurchaseOrder(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("purchaseOrders", "edit");
  const parsed = parseForm(orderSchema, formData);
  if (!parsed.ok) return parsed.state;
  const lines = parseLines(formData);
  if (!lines.ok) return lines.state;
  const doc = computeDocument(lines.lines);

  try {
    await db.$transaction(async (tx) => {
      const { count } = await tx.purchaseOrder.updateMany({
        where: { id, status: "DRAFT" },
        data: { ...parsed.data, subtotal: doc.subtotal, taxTotal: doc.taxTotal, total: doc.total },
      });
      if (count === 0) throw new OrderError("Only draft purchase orders can be edited.");
      await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
      await tx.purchaseOrderLine.createMany({ data: doc.lines.map((l) => ({ ...l, purchaseOrderId: id })) });
      const order = await tx.purchaseOrder.findUniqueOrThrow({ where: { id }, select: { number: true } });
      await logActivity(
        { userId: user.id, entityType: "PurchaseOrder", entityId: id, action: "updated", message: `Purchase order ${order.number} updated` },
        tx,
      );
    });
  } catch (e) {
    if (e instanceof OrderError) return { error: e.message };
    throw e;
  }

  revalidateOrder(id, parsed.data.supplierId);
  redirect(`/purchasing/orders/${id}`);
}

/** Moves an order between statuses only if it is currently in one of `from`. */
async function changeStatus(
  id: string,
  from: PurchaseOrderStatus[],
  to: PurchaseOrderStatus,
  verb: string,
  check?: (tx: Tx) => Promise<void>,
): Promise<ActionState> {
  const user = await requireUser("purchaseOrders", "edit");
  let supplierId: string;
  try {
    supplierId = await db.$transaction(async (tx) => {
      await check?.(tx);
      const { count } = await tx.purchaseOrder.updateMany({ where: { id, status: { in: from } }, data: { status: to } });
      if (count === 0) throw new OrderError(`This order can no longer be ${verb}.`);
      const order = await tx.purchaseOrder.findUniqueOrThrow({ where: { id }, select: { number: true, supplierId: true } });
      await logActivity(
        { userId: user.id, entityType: "PurchaseOrder", entityId: id, action: to.toLowerCase(), message: `Purchase order ${order.number} ${verb}` },
        tx,
      );
      return order.supplierId;
    });
  } catch (e) {
    if (e instanceof OrderError) return { error: e.message };
    throw e;
  }
  revalidateOrder(id, supplierId);
  revalidatePath("/dashboard");
  return undefined;
}

export async function placePurchaseOrder(id: string): Promise<ActionState> {
  return changeStatus(id, ["DRAFT"], "ORDERED", "placed");
}

export async function cancelPurchaseOrder(id: string): Promise<ActionState> {
  return changeStatus(id, ["DRAFT", "ORDERED"], "CANCELLED", "cancelled", async (tx) => {
    const received = await tx.purchaseOrderLine.count({ where: { purchaseOrderId: id, receivedQty: { gt: 0 } } });
    if (received > 0) throw new OrderError("Goods have already been received against this order, so it cannot be cancelled.");
  });
}

export async function receivePurchaseOrder(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("purchaseOrders");
  if (!canReceiveGoods(user.role)) redirect("/forbidden");
  const note = String(formData.get("note") ?? "").trim() || undefined;

  let order: { supplierId: string; productIds: string[] };
  try {
    order = await db.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUnique({
        where: { id },
        include: { lines: { orderBy: { position: "asc" }, include: { product: { select: { name: true } } } } },
      });
      if (!po) throw new OrderError("Purchase order not found.");
      if (po.status !== "ORDERED" && po.status !== "PARTIALLY_RECEIVED") {
        throw new OrderError("Goods can only be received against an ordered purchase order.");
      }

      const receipts: Array<{ line: (typeof po.lines)[number]; qty: number }> = [];
      for (const line of po.lines) {
        const raw = String(formData.get(`qty_${line.id}`) ?? "").trim();
        const qty = round3(Number(raw || 0));
        if (!Number.isFinite(qty) || qty < 0) throw new OrderError(`Enter a valid quantity for ${line.product.name}.`);
        const remaining = round3(num(line.quantity) - num(line.receivedQty));
        if (qty > remaining) {
          throw new OrderError(`Only ${formatNumber(remaining)} of ${line.product.name} remain to be received; you entered ${formatNumber(qty)}.`);
        }
        if (qty > 0) receipts.push({ line, qty });
      }
      if (receipts.length === 0) throw new OrderError("Enter a quantity to receive on at least one line.");

      for (const { line, qty } of receipts) {
        // Optimistic check: fails if someone else received this line in the meantime.
        const { count } = await tx.purchaseOrderLine.updateMany({
          where: { id: line.id, receivedQty: line.receivedQty },
          data: { receivedQty: { increment: qty } },
        });
        if (count === 0) throw new OrderError("This order was updated by someone else. Reload and try again.");
        await adjustStock(tx, {
          productId: line.productId,
          warehouseId: po.warehouseId,
          quantity: qty,
          type: "RECEIPT",
          unitCost: num(line.unitPrice),
          referenceType: "PurchaseOrder",
          referenceId: po.id,
          reference: po.number,
          note,
          userId: user.id,
        });
      }

      const received = new Map(receipts.map((r) => [r.line.id, r.qty]));
      const complete = po.lines.every((l) => round3(num(l.receivedQty) + (received.get(l.id) ?? 0)) >= num(l.quantity));
      const status: PurchaseOrderStatus = complete ? "RECEIVED" : "PARTIALLY_RECEIVED";
      const { count } = await tx.purchaseOrder.updateMany({
        where: { id, status: { in: ["ORDERED", "PARTIALLY_RECEIVED"] } },
        data: { status },
      });
      if (count === 0) throw new OrderError("This order was updated by someone else. Reload and try again.");

      await logActivity(
        {
          userId: user.id,
          entityType: "PurchaseOrder",
          entityId: id,
          action: status.toLowerCase(),
          message: `Goods received against ${po.number} (${receipts.length} line${receipts.length === 1 ? "" : "s"}); now ${complete ? "fully received" : "partially received"}`,
        },
        tx,
      );
      return { supplierId: po.supplierId, productIds: receipts.map((r) => r.line.productId) };
    });
  } catch (e) {
    if (e instanceof OrderError) return { error: e.message };
    throw e;
  }

  revalidateOrder(id, order.supplierId);
  revalidatePath("/inventory/stock");
  revalidatePath("/inventory/movements");
  revalidatePath("/inventory/products");
  for (const productId of order.productIds) revalidatePath(`/inventory/products/${productId}`);
  revalidatePath("/dashboard");
  redirect(`/purchasing/orders/${id}`);
}
