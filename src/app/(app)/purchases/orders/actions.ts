"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { f, parseForm, parseLines, type ActionState } from "@/lib/forms";
import { nextDocumentNumber } from "@/lib/sequence";
import { computeDocument } from "@/lib/totals";
import { lineData, DocumentError } from "../../sales/_lib/documents";
import { warehouseBranchId } from "@/lib/branch";

const orderSchema = z.object({
  supplierId: f.id("Supplier"),
  warehouseId: f.id("Warehouse"),
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
});

export async function createPurchaseOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const parsed = parseForm(orderSchema, formData);
  if (!parsed.ok) return parsed.state;
  const items = parseLines(formData);
  if (!items.ok) return items.state;
  const doc = computeDocument(items.lines);
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
        lines: { create: doc.lines.map(lineData) },
      },
    });
    await logActivity({ userId: user.id, entityType: "PurchaseOrder", entityId: created.id, action: "created", message: "Purchase order " + number + " created" }, tx);
    return created;
  });
  revalidatePath("/purchases/orders");
  redirect("/purchases/orders/" + order.id);
}

export async function updatePurchaseOrder(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const parsed = parseForm(orderSchema, formData);
  if (!parsed.ok) return parsed.state;
  const items = parseLines(formData);
  if (!items.ok) return items.state;
  const doc = computeDocument(items.lines);
  try {
    await db.$transaction(async (tx) => {
      const current = await tx.purchaseOrder.findUnique({ where: { id }, select: { number: true, status: true } });
      if (!current) throw new DocumentError("Purchase order not found.");
      if (current.status !== "DRAFT") throw new DocumentError("Only draft purchase orders can be edited.");
      await tx.purchaseOrder.update({ where: { id }, data: { ...parsed.data, branchId: await warehouseBranchId(tx, parsed.data.warehouseId), subtotal: doc.subtotal, taxTotal: doc.taxTotal, total: doc.total } });
      await tx.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } });
      await tx.purchaseOrderLine.createMany({ data: doc.lines.map((l) => ({ ...lineData(l), purchaseOrderId: id })) });
      await logActivity({ userId: user.id, entityType: "PurchaseOrder", entityId: id, action: "updated", message: "Purchase order " + current.number + " updated" }, tx);
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not update purchase order." };
  }
  revalidatePath("/purchases/orders");
  revalidatePath("/purchases/orders/" + id);
  redirect("/purchases/orders/" + id);
}

export async function confirmPurchaseOrder(id: string): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const result = await db.purchaseOrder.updateMany({ where: { id, status: "DRAFT" }, data: { status: "ORDERED" } });
  if (!result.count) return { error: "Only draft purchase orders can be ordered." };
  await logActivity({ userId: user.id, entityType: "PurchaseOrder", entityId: id, action: "ordered", message: "Purchase order confirmed" });
  revalidatePath("/purchases/orders");
  revalidatePath("/purchases/orders/" + id);
  return undefined;
}

export async function cancelPurchaseOrder(id: string): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const current = await db.purchaseOrder.findUnique({ where: { id }, select: { number: true, status: true, lines: { select: { receivedQty: true } } } });
  if (!current) return { error: "Purchase order not found." };
  if (current.status !== "DRAFT" && current.status !== "ORDERED") return { error: "Only open purchase orders can be cancelled." };
  if (current.lines.some((l) => Number(l.receivedQty) > 0)) return { error: "Goods have already been received against this order." };
  await db.purchaseOrder.update({ where: { id }, data: { status: "CANCELLED" } });
  await logActivity({ userId: user.id, entityType: "PurchaseOrder", entityId: id, action: "cancelled", message: "Purchase order " + current.number + " cancelled" });
  revalidatePath("/purchases/orders");
  revalidatePath("/purchases/orders/" + id);
  return undefined;
}
