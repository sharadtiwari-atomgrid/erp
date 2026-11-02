"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { QcResult } from "@/generated/prisma/enums";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatNumber, num } from "@/lib/format";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { adjustStock } from "@/lib/stock";
import { assertBin, putIntoBin } from "../_lib/bins";
import { attempt, WarehouseError } from "../_lib/errors";
import { createGrn, syncPurchaseOrderStatus } from "../_lib/inbound";
import { EPSILON, plural, readQty, round3 } from "../_lib/qty";
import { revalidateInbound, revalidateStockPages } from "../_lib/revalidate";

const headerSchema = z.object({
  supplierId: f.id("Supplier"),
  warehouseId: f.id("Warehouse"),
  receivedAt: f.optionalDate(),
  supplierInvoice: f.optionalText(),
  vehicleNo: f.optionalText().transform((v) => (v ? v.toUpperCase() : null)),
  notes: f.optionalText(),
});

const linesSchema = z
  .array(
    z.object({
      productId: z.string().min(1, "Choose a product on every line"),
      receivedQty: z.coerce.number().positive("Received quantity must be greater than 0"),
      unitCost: z.coerce.number().min(0, "Unit cost cannot be negative"),
    }),
  )
  .min(1, "Add at least one product");

/** Standalone GRN (no purchase order): supplier + products. */
export async function createInbound(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("inbound", "edit");
  const parsed = parseForm(headerSchema, formData);
  if (!parsed.ok) return parsed.state;

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { error: "Could not read the line items." };
  }
  const lines = linesSchema.safeParse(raw);
  if (!lines.success) return { error: lines.error.issues[0]?.message ?? "Invalid line items." };

  const result = await attempt(() =>
    db.$transaction((tx) =>
      createGrn(tx, {
        ...parsed.data,
        lines: lines.data.map((l) => ({ ...l, receivedQty: round3(l.receivedQty) })),
        userId: user.id,
      }),
    ),
  );
  if (!result.ok) return { error: result.error };

  revalidateInbound(result.value.id);
  revalidateStockPages();
  redirect(`/warehouse/inbound/${result.value.id}`);
}

/**
 * Records QC per line and completes the GRN in one transaction: accepted
 * quantity is posted to stock (RECEIPT at the line's unit cost), optionally
 * put away into a bin. The form posts accepted_/rejected_/notes_/bin_<lineId>.
 */
export async function completeQc(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("inbound", "edit");

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const receipt = await tx.inboundReceipt.findUnique({
        where: { id },
        include: { lines: { include: { product: { select: { name: true } } } } },
      });
      if (!receipt) throw new WarehouseError("GRN not found.");

      const decisions = [];
      for (const line of receipt.lines) {
        const received = num(line.receivedQty);
        const accepted = readQty(formData, `accepted_${line.id}`);
        const rejected = readQty(formData, `rejected_${line.id}`);
        if (accepted === null || rejected === null) throw new WarehouseError(`Enter valid quantities for ${line.product.name}.`);
        if (Math.abs(accepted + rejected - received) > EPSILON) {
          throw new WarehouseError(
            `${line.product.name}: accepted (${formatNumber(accepted)}) + rejected (${formatNumber(rejected)}) must equal received (${formatNumber(received)}).`,
          );
        }
        const binId = String(formData.get(`bin_${line.id}`) ?? "").trim() || null;
        if (binId && accepted > 0) await assertBin(tx, binId, receipt.warehouseId);
        const notes = String(formData.get(`notes_${line.id}`) ?? "").trim() || null;
        const qcResult: QcResult = accepted <= EPSILON ? "FAILED" : rejected <= EPSILON ? "PASSED" : "PARTIAL";
        decisions.push({ line, accepted, rejected, binId: accepted > 0 ? binId : null, notes, qcResult });
      }

      // Guarded transition: a double click completes QC (and posts stock) only once.
      const { count } = await tx.inboundReceipt.updateMany({
        where: { id, status: "QC_PENDING" },
        data: { status: "COMPLETED", qcCompletedAt: new Date() },
      });
      if (count === 0) throw new WarehouseError("QC has already been completed or the GRN was cancelled.");

      for (const d of decisions) {
        await tx.inboundLine.update({
          where: { id: d.line.id },
          data: { acceptedQty: d.accepted, rejectedQty: d.rejected, qcResult: d.qcResult, qcNotes: d.notes, binId: d.binId },
        });
        if (d.accepted <= 0) continue;
        await adjustStock(tx, {
          productId: d.line.productId,
          warehouseId: receipt.warehouseId,
          quantity: d.accepted,
          type: "RECEIPT",
          unitCost: num(d.line.unitCost),
          referenceType: "InboundReceipt",
          referenceId: receipt.id,
          reference: receipt.number,
          note: d.rejected > 0 ? `${formatNumber(d.rejected)} rejected in QC` : undefined,
          userId: user.id,
        });
        if (d.binId) await putIntoBin(tx, { binId: d.binId, productId: d.line.productId, quantity: d.accepted });
      }

      const accepted = round3(decisions.reduce((s, d) => s + d.accepted, 0));
      const rejected = round3(decisions.reduce((s, d) => s + d.rejected, 0));
      await logActivity(
        {
          userId: user.id,
          entityType: "InboundReceipt",
          entityId: id,
          action: "completed",
          message: `QC completed on ${receipt.number}: ${formatNumber(accepted)} accepted, ${formatNumber(rejected)} rejected (${plural(decisions.length, "line")})`,
        },
        tx,
      );
      return { purchaseOrderId: receipt.purchaseOrderId, productIds: decisions.map((d) => d.line.productId) };
    }),
  );
  if (!result.ok) return { error: result.error };

  revalidateInbound(id, result.value.purchaseOrderId);
  revalidateStockPages(result.value.productIds);
  return { success: "QC completed and accepted stock posted." };
}

/** Cancels a GRN awaiting QC and gives the received quantity back to its PO lines. */
export async function cancelInbound(id: string): Promise<ActionState> {
  const user = await requireUser("inbound", "edit");

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const { count } = await tx.inboundReceipt.updateMany({ where: { id, status: "QC_PENDING" }, data: { status: "CANCELLED" } });
      if (count === 0) throw new WarehouseError("Only GRNs awaiting QC can be cancelled.");
      const receipt = await tx.inboundReceipt.findUniqueOrThrow({
        where: { id },
        include: { purchaseOrder: { select: { number: true } }, lines: { select: { purchaseOrderLineId: true, receivedQty: true } } },
      });

      if (receipt.purchaseOrderId) {
        for (const line of receipt.lines) {
          if (!line.purchaseOrderLineId) continue;
          const qty = num(line.receivedQty);
          const { count: reversed } = await tx.purchaseOrderLine.updateMany({
            where: { id: line.purchaseOrderLineId, receivedQty: { gte: round3(qty - EPSILON) } },
            data: { receivedQty: { decrement: qty } },
          });
          if (reversed === 0) throw new WarehouseError("The purchase order no longer matches this GRN. Reload and try again.");
        }
        const status = await syncPurchaseOrderStatus(tx, receipt.purchaseOrderId);
        await logActivity(
          {
            userId: user.id,
            entityType: "PurchaseOrder",
            entityId: receipt.purchaseOrderId,
            action: "receipt_cancelled",
            message: `GRN ${receipt.number} cancelled; received quantities reversed${status ? ` (now ${status.toLowerCase().replace(/_/g, " ")})` : ""}`,
          },
          tx,
        );
      }
      await logActivity(
        { userId: user.id, entityType: "InboundReceipt", entityId: id, action: "cancelled", message: `GRN ${receipt.number} cancelled` },
        tx,
      );
      return receipt.purchaseOrderId;
    }),
  );
  if (!result.ok) return { error: result.error };

  revalidateInbound(id, result.value);
  revalidateStockPages();
  return undefined;
}
