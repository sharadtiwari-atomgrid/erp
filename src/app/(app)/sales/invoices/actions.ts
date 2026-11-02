"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, formatMoney, humanize, num } from "@/lib/format";
import { f, parseForm, parseLines, type ActionState } from "@/lib/forms";
import { nextDocumentNumber } from "@/lib/sequence";
import { computeDocument, round2 } from "@/lib/totals";
import { PaymentMethod } from "@/generated/prisma/enums";
import { attempt } from "../_lib/attempt";
import { DocumentError, lineData } from "../_lib/documents";
import { defaultBranchId } from "@/lib/branch";

const invoiceSchema = z.object({
  customerId: f.id("Customer"),
  issueDate: f.date(),
  dueDate: f.optionalDate(),
  placeOfSupply: f.optionalText(),
  notes: f.optionalText(),
});

const paymentSchema = z.object({
  date: f.date(),
  amount: f.number({ min: 0.01, label: "Amount" }),
  method: z.enum(PaymentMethod, { error: "Choose a payment method" }),
  reference: f.optionalText(),
  notes: f.optionalText(),
});

function revalidateInvoice(id: string, customerId?: string) {
  revalidatePath("/sales/invoices");
  revalidatePath(`/sales/invoices/${id}`);
  if (customerId) revalidatePath(`/contacts/${customerId}`);
}

export async function createInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("invoices", "edit");
  const parsed = parseForm(invoiceSchema, formData);
  if (!parsed.ok) return parsed.state;
  const items = parseLines(formData);
  if (!items.ok) return items.state;
  const doc = computeDocument(items.lines);

  const branchId = await defaultBranchId();
  const invoice = await db.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, "INVOICE");
    const created = await tx.invoice.create({
      data: {
        ...parsed.data,
        branchId,
        number,
        subtotal: doc.subtotal,
        taxTotal: doc.taxTotal,
        total: doc.total,
        lines: { create: doc.lines.map(lineData) },
      },
    });
    await logActivity(
      { userId: user.id, entityType: "Invoice", entityId: created.id, action: "created", message: `Invoice ${number} created` },
      tx,
    );
    return created;
  });

  revalidateInvoice(invoice.id, invoice.customerId);
  redirect(`/sales/invoices/${invoice.id}`);
}

export async function updateInvoice(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("invoices", "edit");
  const parsed = parseForm(invoiceSchema, formData);
  if (!parsed.ok) return parsed.state;
  const items = parseLines(formData);
  if (!items.ok) return items.state;
  const doc = computeDocument(items.lines);

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const current = await tx.invoice.findUnique({ where: { id }, select: { number: true, status: true } });
      if (!current) throw new DocumentError("Invoice not found.");
      if (current.status !== "DRAFT") throw new DocumentError("Only draft invoices can be edited.");

      await tx.invoice.update({
        where: { id },
        data: { ...parsed.data, subtotal: doc.subtotal, taxTotal: doc.taxTotal, total: doc.total },
      });
      await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceLine.createMany({ data: doc.lines.map((l) => ({ ...lineData(l), invoiceId: id })) });
      await logActivity(
        { userId: user.id, entityType: "Invoice", entityId: id, action: "updated", message: `Invoice ${current.number} updated` },
        tx,
      );
    }),
  );
  if (!result.ok) return { error: result.error };

  revalidateInvoice(id, parsed.data.customerId);
  redirect(`/sales/invoices/${id}`);
}

/** DRAFT → ISSUED. Fills in the due date and place of supply from the customer when blank. */
export async function issueInvoice(id: string): Promise<ActionState> {
  const user = await requireUser("invoices", "edit");
  const invoice = await db.invoice.findUnique({
    where: { id },
    include: { customer: { select: { state: true, paymentTermsDays: true } } },
  });
  if (!invoice) return { error: "Invoice not found." };
  if (invoice.status !== "DRAFT") return { error: "Only draft invoices can be issued." };

  await db.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id },
      data: {
        status: "ISSUED",
        dueDate: invoice.dueDate ?? addDays(invoice.issueDate, invoice.customer.paymentTermsDays),
        placeOfSupply: invoice.placeOfSupply ?? invoice.customer.state,
      },
    });
    await logActivity(
      { userId: user.id, entityType: "Invoice", entityId: id, action: "issued", message: `Invoice ${invoice.number} issued for ${formatMoney(invoice.total)}` },
      tx,
    );
  });

  revalidateInvoice(id, invoice.customerId);
  return undefined;
}

export async function cancelInvoice(id: string): Promise<ActionState> {
  const user = await requireUser("invoices", "edit");
  const invoice = await db.invoice.findUnique({
    where: { id },
    select: { number: true, status: true, customerId: true, salesOrderId: true, _count: { select: { payments: true } } },
  });
  if (!invoice) return { error: "Invoice not found." };
  if (invoice.status !== "DRAFT" && invoice.status !== "ISSUED") {
    return { error: `A ${humanize(invoice.status).toLowerCase()} invoice can’t be cancelled.` };
  }
  if (invoice._count.payments > 0) return { error: "Invoices with payments can’t be cancelled." };

  await db.$transaction(async (tx) => {
    await tx.invoice.update({ where: { id }, data: { status: "CANCELLED" } });
    await logActivity(
      { userId: user.id, entityType: "Invoice", entityId: id, action: "cancelled", message: `Invoice ${invoice.number} cancelled` },
      tx,
    );
  });

  revalidateInvoice(id, invoice.customerId);
  if (invoice.salesOrderId) revalidatePath(`/sales/orders/${invoice.salesOrderId}`);
  return undefined;
}

export async function recordPayment(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("invoices", "edit");
  const parsed = parseForm(paymentSchema, formData);
  if (!parsed.ok) return parsed.state;
  const amount = round2(parsed.data.amount);

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({
        where: { id },
        select: { number: true, status: true, customerId: true, total: true, amountPaid: true },
      });
      if (!invoice) throw new DocumentError("Invoice not found.");
      if (invoice.status !== "ISSUED" && invoice.status !== "PARTIALLY_PAID") {
        throw new DocumentError("Payments can only be recorded against issued invoices.");
      }
      const total = num(invoice.total);
      const balance = round2(total - num(invoice.amountPaid));
      if (amount > balance) throw new DocumentError(`Amount can’t exceed the balance of ${formatMoney(balance)}.`);

      const paid = round2(num(invoice.amountPaid) + amount);
      // Guarded on the amount we read so concurrent payments can't overpay.
      const { count } = await tx.invoice.updateMany({
        where: { id, amountPaid: invoice.amountPaid },
        data: { amountPaid: paid, status: paid >= total ? "PAID" : "PARTIALLY_PAID" },
      });
      if (count === 0) throw new DocumentError("This invoice was just updated. Reload and try again.");

      await tx.payment.create({ data: { ...parsed.data, amount, invoiceId: id } });
      await logActivity(
        {
          userId: user.id,
          entityType: "Invoice",
          entityId: id,
          action: "payment",
          message: `Payment of ${formatMoney(amount)} recorded on ${invoice.number}${paid >= total ? " (paid in full)" : ""}`,
        },
        tx,
      );
      return invoice;
    }),
  );
  if (!result.ok) return { error: result.error };

  revalidateInvoice(id, result.value.customerId);
  return { success: `Payment of ${formatMoney(amount)} recorded.` };
}
