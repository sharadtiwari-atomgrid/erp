"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PaymentMethod } from "@/generated/prisma/enums";
import { recordChange } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { money } from "@/lib/finance/chart";
import { cancelVendorPayment, postVendorPayment } from "@/lib/finance/payables";
import { FinanceError } from "@/lib/finance/posting";
import { openPayables } from "@/lib/finance/queries";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { formatMoney, num } from "@/lib/format";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { todayIso } from "@/lib/ops/dates";
import { nextDocumentNumber } from "@/lib/sequence";
import { checkApplications, cleanApplications, totalApplied, vendorPaymentSplit } from "../_ar_ap/apply";
import { attempt, readApplications } from "../_ar_ap/server";
import { computeTds, tdsRateFor } from "../_ar_ap/tds";

const paymentSchema = z.object({
  date: f.date(),
  supplierId: f.id("Supplier"),
  bankAccountId: f.id("Bank account"),
  method: z.enum(PaymentMethod, { error: "Choose a payment method" }),
  reference: f.optionalText(),
  tdsSectionId: f.optionalText(),
  tdsOverride: f.checkbox(),
  tdsAmount: f.number({ label: "TDS" }),
  advance: f.number({ label: "Advance" }),
  notes: f.optionalText(),
});

function revalidatePayments(id?: string) {
  revalidatePath("/finance/vendor-payments");
  if (id) revalidatePath(`/finance/vendor-payments/${id}`);
  revalidatePath("/finance", "layout");
}

const invalid = (field: string, message: string): ActionState => ({ error: "Please fix the highlighted fields.", fieldErrors: { [field]: [message] } });

/** Saves a vendor payment with its applications and TDS; posts it straight away when intent = "post". */
export async function createVendorPayment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const parsed = parseForm(paymentSchema, formData);
  if (!parsed.ok) return parsed.state;
  const raw = readApplications(formData);
  if (!raw) return { error: "Could not read the applications." };
  const post = formData.get("intent") === "post";
  const data = parsed.data;

  await ensureFinanceSetup();
  const [bank, supplier, section] = await Promise.all([
    db.bankAccount.findFirst({ where: { id: data.bankAccountId, isActive: true }, select: { id: true } }),
    db.contact.findUnique({ where: { id: data.supplierId }, select: { pan: true, gstin: true, roles: true } }),
    data.tdsSectionId ? db.tdsSection.findFirst({ where: { id: data.tdsSectionId, kind: "TDS", isActive: true } }) : null,
  ]);
  if (!bank) return invalid("bankAccountId", "Choose an active bank or cash account");
  if (!supplier || !supplier.roles.some((r) => r === "SUPPLIER" || r === "TRANSPORTER")) return invalid("supplierId", "Choose a supplier or transporter");
  if (data.tdsSectionId && !section) return invalid("tdsSectionId", "Choose an active TDS section");

  const apps = cleanApplications(raw);
  const open = await openPayables(data.supplierId);
  const bad = checkApplications(apps, open.map((b) => ({ id: b.id, number: b.number, balance: b.balance })));
  if (bad) return { error: bad };

  // TDS = section rate × taxable value of what is applied, unless overridden.
  let tds = 0;
  if (section) {
    if (data.tdsOverride) tds = money(data.tdsAmount);
    else {
      const bills = await db.purchaseInvoice.findMany({ where: { id: { in: apps.map((a) => a.docId) } }, select: { id: true, subtotal: true, total: true } });
      const byId = new Map(bills.map((b) => [b.id, { subtotal: num(b.subtotal), total: num(b.total) }]));
      const rate = tdsRateFor({ rateIndividual: num(section.rateIndividual), rateCompany: num(section.rateCompany) }, supplier);
      tds = computeTds(apps.map((a) => ({ amount: a.amount, bill: byId.get(a.docId) ?? { subtotal: 0, total: 0 } })), rate).tds;
    }
  } else if (data.tdsAmount > 0) {
    return invalid("tdsSectionId", "Choose the TDS section for the tax withheld");
  }
  const applied = totalApplied(apps);
  const advance = money(data.advance);
  const split = vendorPaymentSplit({ applied, tds, advance });
  if (!split.ok) return { error: split.error };

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, "VENDOR_PAYMENT");
      const payment = await tx.vendorPayment.create({
        data: {
          number,
          date: data.date,
          supplierId: data.supplierId,
          bankAccountId: data.bankAccountId,
          amount: split.cash,
          tdsAmount: tds,
          tdsSectionId: section && tds > 0 ? section.id : null,
          method: data.method,
          reference: data.reference,
          unappliedAmount: advance,
          notes: data.notes,
          applications: { create: apps.map((a) => ({ purchaseInvoiceId: a.docId, amount: a.amount })) },
        },
      });
      await recordChange(
        { userId: user.id, entityType: "VendorPayment", entityId: payment.id, action: "created", message: `Payment ${number} for ${formatMoney(split.cash)} created` },
        tx,
      );
      if (post) {
        const txNo = await postVendorPayment(tx, payment.id, user.id);
        await recordChange({ userId: user.id, entityType: "VendorPayment", entityId: payment.id, action: "posted", message: `Payment ${number} posted (transaction ${txNo})` }, tx);
      }
      return payment;
    }, { timeout: 30_000 }),
  );
  if (!result.ok) return { error: result.error };
  revalidatePayments(result.value.id);
  revalidatePath("/finance/purchase-invoices", "layout");
  redirect(`/finance/vendor-payments/${result.value.id}`);
}

export async function postPayment(id: string): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const txNo = await postVendorPayment(tx, id, user.id);
      const p = await tx.vendorPayment.findUniqueOrThrow({ where: { id }, select: { number: true } });
      await recordChange({ userId: user.id, entityType: "VendorPayment", entityId: id, action: "posted", message: `Payment ${p.number} posted (transaction ${txNo})` }, tx);
    }, { timeout: 30_000 }),
  );
  if (!result.ok) return { error: result.error };
  revalidatePayments(id);
  revalidatePath("/finance/purchase-invoices", "layout");
  return undefined;
}

export async function cancelPayment(id: string): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const reversal = await cancelVendorPayment(tx, id, user.id, todayIso());
      const p = await tx.vendorPayment.findUniqueOrThrow({ where: { id }, select: { number: true } });
      await recordChange(
        { userId: user.id, entityType: "VendorPayment", entityId: id, action: "cancelled", message: `Payment ${p.number} cancelled${reversal ? ` (reversal transaction ${reversal})` : ""}` },
        tx,
      );
    }, { timeout: 30_000 }),
  );
  if (!result.ok) return { error: result.error };
  revalidatePayments(id);
  revalidatePath("/finance/purchase-invoices", "layout");
  return undefined;
}

export async function deleteDraftPayment(id: string): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const p = await tx.vendorPayment.findUnique({ where: { id }, select: { number: true, status: true } });
      if (!p) throw new FinanceError("Payment not found.");
      if (p.status !== "DRAFT") throw new FinanceError("Only draft payments can be deleted. Cancel a posted payment instead.");
      await tx.vendorPayment.delete({ where: { id } });
      await recordChange({ userId: user.id, entityType: "VendorPayment", entityId: id, action: "deleted", message: `Draft payment ${p.number} deleted` }, tx);
    }),
  );
  if (!result.ok) return { error: result.error };
  revalidatePayments();
  redirect("/finance/vendor-payments");
}
