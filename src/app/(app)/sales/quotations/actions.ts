"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { humanize } from "@/lib/format";
import { f, parseForm, parseLines, type ActionState } from "@/lib/forms";
import { can } from "@/lib/permissions";
import { nextDocumentNumber } from "@/lib/sequence";
import { computeDocument } from "@/lib/totals";
import type { QuotationStatus } from "@/generated/prisma/enums";
import { attempt } from "../_lib/attempt";
import { copyLines, DocumentError, lineData } from "../_lib/documents";

const quotationSchema = z.object({
  customerId: f.id("Customer"),
  issueDate: f.date(),
  validUntil: f.optionalDate(),
  notes: f.optionalText(),
});

/** Statuses each manual transition may start from. */
const TRANSITIONS: Partial<Record<QuotationStatus, QuotationStatus[]>> = {
  SENT: ["DRAFT"],
  ACCEPTED: ["DRAFT", "SENT"],
  REJECTED: ["DRAFT", "SENT"],
};

const EDITABLE: QuotationStatus[] = ["DRAFT", "SENT"];
const CONVERTIBLE: QuotationStatus[] = ["DRAFT", "SENT", "ACCEPTED"];

function revalidateQuotation(id: string) {
  revalidatePath("/sales/quotations");
  revalidatePath(`/sales/quotations/${id}`);
}

export async function createQuotation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("quotations", "edit");
  const parsed = parseForm(quotationSchema, formData);
  if (!parsed.ok) return parsed.state;
  const items = parseLines(formData);
  if (!items.ok) return items.state;
  const doc = computeDocument(items.lines);

  const quotation = await db.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, "QUOTATION");
    const created = await tx.quotation.create({
      data: {
        ...parsed.data,
        number,
        subtotal: doc.subtotal,
        taxTotal: doc.taxTotal,
        total: doc.total,
        lines: { create: doc.lines.map(lineData) },
      },
    });
    await logActivity(
      { userId: user.id, entityType: "Quotation", entityId: created.id, action: "created", message: `Quotation ${number} created` },
      tx,
    );
    return created;
  });

  revalidatePath("/sales/quotations");
  redirect(`/sales/quotations/${quotation.id}`);
}

export async function updateQuotation(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("quotations", "edit");
  const parsed = parseForm(quotationSchema, formData);
  if (!parsed.ok) return parsed.state;
  const items = parseLines(formData);
  if (!items.ok) return items.state;
  const doc = computeDocument(items.lines);

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const current = await tx.quotation.findUnique({ where: { id }, select: { number: true, status: true } });
      if (!current) throw new DocumentError("Quotation not found.");
      if (!EDITABLE.includes(current.status)) throw new DocumentError("Only draft or sent quotations can be edited.");

      await tx.quotation.update({
        where: { id },
        data: { ...parsed.data, subtotal: doc.subtotal, taxTotal: doc.taxTotal, total: doc.total },
      });
      await tx.quotationLine.deleteMany({ where: { quotationId: id } });
      await tx.quotationLine.createMany({ data: doc.lines.map((l) => ({ ...lineData(l), quotationId: id })) });
      await logActivity(
        { userId: user.id, entityType: "Quotation", entityId: id, action: "updated", message: `Quotation ${current.number} updated` },
        tx,
      );
    }),
  );
  if (!result.ok) return { error: result.error };

  revalidateQuotation(id);
  redirect(`/sales/quotations/${id}`);
}

/** Mark sent / accepted / rejected. */
export async function setQuotationStatus(id: string, status: QuotationStatus): Promise<ActionState> {
  const user = await requireUser("quotations", "edit");
  const from = TRANSITIONS[status];
  if (!from) return { error: `Quotations can’t be marked ${humanize(status).toLowerCase()} manually.` };

  const quotation = await db.quotation.findUnique({ where: { id }, select: { number: true, status: true } });
  if (!quotation) return { error: "Quotation not found." };
  if (!from.includes(quotation.status)) {
    return { error: `A ${humanize(quotation.status).toLowerCase()} quotation can’t be marked ${humanize(status).toLowerCase()}.` };
  }

  await db.$transaction(async (tx) => {
    await tx.quotation.update({ where: { id }, data: { status } });
    await logActivity(
      {
        userId: user.id,
        entityType: "Quotation",
        entityId: id,
        action: status.toLowerCase(),
        message: `Quotation ${quotation.number} marked ${humanize(status).toLowerCase()}`,
      },
      tx,
    );
  });

  revalidateQuotation(id);
  return undefined;
}

/** Creates a draft sales order with the quotation's lines and marks the quotation CONVERTED. */
export async function convertQuotation(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("quotations", "edit");
  if (!can(user.role, "salesOrders", "edit")) return { error: "You don’t have permission to create sales orders." };
  const warehouseId = String(formData.get("warehouseId") ?? "");
  if (!warehouseId) return { error: "Choose a warehouse to deliver from." };

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const quotation = await tx.quotation.findUnique({ where: { id }, include: { lines: { orderBy: { position: "asc" } } } });
      if (!quotation) throw new DocumentError("Quotation not found.");
      const warehouse = await tx.warehouse.findFirst({ where: { id: warehouseId, isActive: true }, select: { id: true } });
      if (!warehouse) throw new DocumentError("Choose an active warehouse.");
      // Guarded update so two clicks can't create two orders.
      const { count } = await tx.quotation.updateMany({
        where: { id, status: { in: CONVERTIBLE } },
        data: { status: "CONVERTED" },
      });
      if (count === 0) throw new DocumentError(`A ${humanize(quotation.status).toLowerCase()} quotation can’t be converted.`);

      const number = await nextDocumentNumber(tx, "SALES_ORDER");
      const order = await tx.salesOrder.create({
        data: {
          number,
          customerId: quotation.customerId,
          quotationId: id,
          warehouseId,
          subtotal: quotation.subtotal,
          taxTotal: quotation.taxTotal,
          total: quotation.total,
          notes: quotation.notes,
          lines: { create: copyLines(quotation.lines) },
        },
      });
      await logActivity(
        { userId: user.id, entityType: "Quotation", entityId: id, action: "converted", message: `Quotation ${quotation.number} converted to ${number}` },
        tx,
      );
      await logActivity(
        { userId: user.id, entityType: "SalesOrder", entityId: order.id, action: "created", message: `Sales order ${number} created from ${quotation.number}` },
        tx,
      );
      return order;
    }),
  );
  if (!result.ok) return { error: result.error };

  revalidateQuotation(id);
  revalidatePath("/sales/orders");
  redirect(`/sales/orders/${result.value.id}`);
}
