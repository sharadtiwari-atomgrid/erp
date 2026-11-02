import "server-only";
import type { PurchaseOrderStatus } from "@/generated/prisma/enums";
import { logActivity } from "@/lib/activity";
import { warehouseBranchId } from "@/lib/branch";
import type { Tx } from "@/lib/db";
import { formatNumber, num } from "@/lib/format";
import { nextDocumentNumber } from "@/lib/sequence";
import { WarehouseError } from "./errors";
import { EPSILON, plural, round3 } from "./qty";

export type GrnLineInput = {
  productId: string;
  purchaseOrderLineId?: string | null;
  receivedQty: number;
  unitCost: number;
};

export type GrnInput = {
  warehouseId: string;
  supplierId: string | null;
  purchaseOrderId?: string | null;
  receivedAt?: Date | null;
  supplierInvoice: string | null;
  vehicleNo: string | null;
  notes: string | null;
  lines: GrnLineInput[];
  userId: string;
};

/** PO status implied by its lines' received quantities. */
function purchaseStatusFor(lines: Array<{ quantity: number; receivedQty: number }>): PurchaseOrderStatus {
  if (lines.every((l) => l.receivedQty <= EPSILON)) return "ORDERED";
  return lines.every((l) => l.receivedQty + EPSILON >= l.quantity) ? "RECEIVED" : "PARTIALLY_RECEIVED";
}

/** Recomputes and stores the PO status from its lines. Only touches open or received orders. */
export async function syncPurchaseOrderStatus(tx: Tx, purchaseOrderId: string): Promise<PurchaseOrderStatus | null> {
  const lines = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId }, select: { quantity: true, receivedQty: true } });
  const status = purchaseStatusFor(lines.map((l) => ({ quantity: num(l.quantity), receivedQty: num(l.receivedQty) })));
  const { count } = await tx.purchaseOrder.updateMany({
    where: { id: purchaseOrderId, status: { in: ["ORDERED", "PARTIALLY_RECEIVED", "RECEIVED"] } },
    data: { status },
  });
  return count > 0 ? status : null;
}

/**
 * Creates a GRN in QC_PENDING. Against a PO it also books the received
 * quantity on each PO line (over-receipt is an error) and moves the PO to
 * PARTIALLY_RECEIVED / RECEIVED. Stock is not touched until QC completes.
 * Lines for products that need no QC start fully accepted.
 */
export async function createGrn(tx: Tx, input: GrnInput) {
  const lines = input.lines.filter((l) => l.receivedQty > 0);
  if (lines.length === 0) throw new WarehouseError("Enter a received quantity on at least one line.");

  const products = await tx.product.findMany({
    where: { id: { in: [...new Set(lines.map((l) => l.productId))] } },
    select: { id: true, name: true, type: true, qcRequired: true },
  });
  const productById = new Map(products.map((p) => [p.id, p]));
  for (const l of lines) {
    const p = productById.get(l.productId);
    if (!p) throw new WarehouseError("Product not found.");
    if (p.type === "SERVICE") throw new WarehouseError(`${p.name} is a service and cannot be received into a warehouse.`);
  }

  let poNumber: string | null = null;
  if (input.purchaseOrderId) {
    const po = await tx.purchaseOrder.findUnique({
      where: { id: input.purchaseOrderId },
      include: { lines: { include: { product: { select: { name: true } } } } },
    });
    if (!po) throw new WarehouseError("Purchase order not found.");
    if (po.status !== "ORDERED" && po.status !== "PARTIALLY_RECEIVED") {
      throw new WarehouseError("Goods can only be received against an ordered purchase order.");
    }
    poNumber = po.number;
    const poLines = new Map(po.lines.map((l) => [l.id, l]));
    for (const l of lines) {
      const poLine = l.purchaseOrderLineId ? poLines.get(l.purchaseOrderLineId) : undefined;
      if (!poLine) throw new WarehouseError("A line does not belong to this purchase order.");
      const ordered = num(poLine.quantity);
      const remaining = round3(ordered - num(poLine.receivedQty));
      if (l.receivedQty > remaining + EPSILON) {
        throw new WarehouseError(
          `Only ${formatNumber(remaining)} of ${poLine.product.name} remain to be received; you entered ${formatNumber(l.receivedQty)}.`,
        );
      }
      // Guarded increment so concurrent receipts can't exceed the ordered quantity.
      const { count } = await tx.purchaseOrderLine.updateMany({
        where: { id: poLine.id, receivedQty: { lte: round3(ordered - l.receivedQty + EPSILON) } },
        data: { receivedQty: { increment: l.receivedQty } },
      });
      if (count === 0) throw new WarehouseError(`${poLine.product.name} was received by someone else. Reload and try again.`);
    }
  }

  const number = await nextDocumentNumber(tx, "INBOUND");
  const receipt = await tx.inboundReceipt.create({
    data: {
      number,
      purchaseOrderId: input.purchaseOrderId ?? null,
      supplierId: input.supplierId,
      warehouseId: input.warehouseId,
      branchId: await warehouseBranchId(tx, input.warehouseId),
      ...(input.receivedAt && { receivedAt: input.receivedAt }),
      supplierInvoice: input.supplierInvoice,
      vehicleNo: input.vehicleNo,
      notes: input.notes,
      lines: {
        create: lines.map((l) => ({
          productId: l.productId,
          purchaseOrderLineId: l.purchaseOrderLineId ?? null,
          receivedQty: l.receivedQty,
          unitCost: l.unitCost,
          acceptedQty: productById.get(l.productId)!.qcRequired ? 0 : l.receivedQty,
        })),
      },
    },
  });

  await logActivity(
    {
      userId: input.userId,
      entityType: "InboundReceipt",
      entityId: receipt.id,
      action: "created",
      message: `GRN ${number} created${poNumber ? ` against ${poNumber}` : ""} (${plural(lines.length, "line")}); awaiting QC`,
    },
    tx,
  );

  if (input.purchaseOrderId) {
    const status = await syncPurchaseOrderStatus(tx, input.purchaseOrderId);
    await logActivity(
      {
        userId: input.userId,
        entityType: "PurchaseOrder",
        entityId: input.purchaseOrderId,
        action: (status ?? "received").toLowerCase(),
        message: `Goods received on ${number} (${plural(lines.length, "line")}); now ${status === "RECEIVED" ? "fully received" : "partially received"}`,
      },
      tx,
    );
  }

  return receipt;
}
