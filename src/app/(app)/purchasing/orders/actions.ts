"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { PurchaseOrderStatus } from "@/generated/prisma/enums";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db, type Tx } from "@/lib/db";
import { num } from "@/lib/format";
import { f, parseForm, parseLines, type ActionState } from "@/lib/forms";
import { nextDocumentNumber } from "@/lib/sequence";
import { computeDocument } from "@/lib/totals";
import { canReceiveGoods } from "../_components/access";
import { warehouseBranchId } from "@/lib/branch";
import { WarehouseError } from "../../warehouse/_lib/errors";
import { createGrn } from "../../warehouse/_lib/inbound";

/** Thrown inside a transaction to roll it back and show the message to the user. */
class OrderError extends Error {}

const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

const orderSchema = z
  .object({
    supplierId: f.id("Supplier"),
    warehouseId: f.id("Receiving warehouse"),
    orderDate: f.date(),
    postingDate: f.optionalDate(),
    expectedReceiptDate: f.optionalDate(),
    vendorOrderNo: f.optionalText(),
    payToVendorId: f.optionalText(),
    shipToCode: f.optionalText(),
    shipToName: f.optionalText(),
    shipToAddress: f.optionalText(),
    shipToCity: f.optionalText(),
    shipToState: f.optionalText(),
    shipToPincode: f.optionalText(),
    paymentTermsCode: f.optionalText(),
    paymentMethodCode: f.optionalText(),
    shipmentMethodCode: f.optionalText(),
    currencyCode: f.optionalText(),
    externalDocumentNo: f.optionalText(),
    purchaserCode: f.optionalText(),
    postingDescription: f.optionalText(),
    locationCode: f.optionalText(),
    notes: f.optionalText(),
  })
  .refine((d) => !d.expectedReceiptDate || d.expectedReceiptDate >= d.orderDate, {
    path: ["expectedReceiptDate"],
    message: "Expected receipt date cannot be before the order date",
  });

const receiveSchema = z.object({
  receivedAt: f.optionalDate(),
  supplierInvoice: f.optionalText(),
  vehicleNo: f.optionalText().transform((v) => (v ? v.toUpperCase() : null)),
  notes: f.optionalText(),
});

function revalidateOrder(id: string, supplierId?: string) {
  revalidatePath("/purchasing/orders");
  revalidatePath(`/purchasing/orders/${id}`);
  if (supplierId) revalidatePath(`/contacts/${supplierId}`);
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
        branchId: await warehouseBranchId(tx, parsed.data.warehouseId),
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
        data: {
          ...parsed.data,
          branchId: await warehouseBranchId(tx, parsed.data.warehouseId),
          subtotal: doc.subtotal,
          taxTotal: doc.taxTotal,
          total: doc.total,
        },
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

/**
 * "Receive goods" now creates a goods receipt note (GRN) in QC_PENDING. The
 * PO line received quantities and PO status are updated straight away; stock
 * is posted only when QC is completed on the GRN.
 */
export async function receivePurchaseOrder(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("purchaseOrders");
  if (!canReceiveGoods(user)) redirect("/forbidden");
  const parsed = parseForm(receiveSchema, formData);
  if (!parsed.ok) return parsed.state;

  let receipt: { id: string };
  try {
    receipt = await db.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.findUnique({
        where: { id },
        include: { lines: { orderBy: { position: "asc" }, include: { product: { select: { name: true } } } } },
      });
      if (!po) throw new OrderError("Purchase order not found.");

      const lines = [];
      for (const line of po.lines) {
        const raw = String(formData.get(`qty_${line.id}`) ?? "").trim();
        const qty = round3(Number(raw || 0));
        if (!Number.isFinite(qty) || qty < 0) throw new OrderError(`Enter a valid quantity for ${line.product.name}.`);
        if (qty > 0) lines.push({ productId: line.productId, purchaseOrderLineId: line.id, receivedQty: qty, unitCost: num(line.unitPrice) });
      }

      return createGrn(tx, {
        ...parsed.data,
        warehouseId: po.warehouseId,
        supplierId: po.supplierId,
        purchaseOrderId: po.id,
        lines,
        userId: user.id,
      });
    });
  } catch (e) {
    if (e instanceof OrderError) return { error: e.message };
    if (e instanceof WarehouseError) return { error: e.message };
    throw e;
  }

  revalidateOrder(id);
  revalidatePath("/warehouse/inbound");
  revalidatePath("/inventory/stock");
  revalidatePath("/dashboard");
  redirect(`/warehouse/inbound/${receipt.id}`);
}
