"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { PaymentMethod } from "@/generated/prisma/enums";
import { recordChange } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { money } from "@/lib/finance/chart";
import { FinanceError } from "@/lib/finance/posting";
import { openReceivables } from "@/lib/finance/queries";
import { cancelCashReceipt, postCashReceipt } from "@/lib/finance/receivables";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { formatMoney } from "@/lib/format";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { todayIso } from "@/lib/ops/dates";
import { nextDocumentNumber } from "@/lib/sequence";
import { checkApplications, cleanApplications, receiptSplit, totalApplied } from "../_ar_ap/apply";
import { attempt, readApplications } from "../_ar_ap/server";

const receiptSchema = z.object({
  date: f.date(),
  customerId: f.id("Customer"),
  bankAccountId: f.id("Bank account"),
  amount: f.number({ min: 0.01, label: "Amount" }),
  method: z.enum(PaymentMethod, { error: "Choose a payment method" }),
  reference: f.optionalText(),
  tdsAmount: f.number({ label: "TDS" }),
  notes: f.optionalText(),
});

function revalidateReceipts(id?: string) {
  revalidatePath("/finance/receipts");
  if (id) revalidatePath(`/finance/receipts/${id}`);
  revalidatePath("/finance", "layout");
  revalidatePath("/sales/invoices", "layout");
}

/** Saves a receipt with its applications; posts it straight away when intent = "post". */
export async function createReceipt(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const parsed = parseForm(receiptSchema, formData);
  if (!parsed.ok) return parsed.state;
  const raw = readApplications(formData);
  if (!raw) return { error: "Could not read the applications." };
  const post = formData.get("intent") === "post";
  const data = parsed.data;

  await ensureFinanceSetup();
  const bank = await db.bankAccount.findFirst({ where: { id: data.bankAccountId, isActive: true }, select: { id: true } });
  if (!bank) return { fieldErrors: { bankAccountId: ["Choose an active bank or cash account"] }, error: "Please fix the highlighted fields." };

  const apps = cleanApplications(raw);
  const open = await openReceivables(data.customerId);
  const invalid = checkApplications(apps, open.map((i) => ({ id: i.id, number: i.number, balance: i.balance })));
  if (invalid) return { error: invalid };
  const amount = money(data.amount);
  const tds = money(data.tdsAmount);
  const split = receiptSplit({ amount, tds, applied: totalApplied(apps) });
  if (!split.ok) return { error: split.error };

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, "CASH_RECEIPT");
      const receipt = await tx.cashReceipt.create({
        data: {
          number,
          date: data.date,
          customerId: data.customerId,
          bankAccountId: data.bankAccountId,
          amount,
          method: data.method,
          reference: data.reference,
          tdsAmount: tds,
          unappliedAmount: split.unapplied,
          notes: data.notes,
          applications: { create: apps.map((a) => ({ invoiceId: a.docId, amount: a.amount })) },
        },
      });
      await recordChange(
        { userId: user.id, entityType: "CashReceipt", entityId: receipt.id, action: "created", message: `Receipt ${number} for ${formatMoney(amount)} created` },
        tx,
      );
      if (post) {
        const txNo = await postCashReceipt(tx, receipt.id, user.id);
        await recordChange(
          { userId: user.id, entityType: "CashReceipt", entityId: receipt.id, action: "posted", message: `Receipt ${number} posted (transaction ${txNo})` },
          tx,
        );
      }
      return receipt;
    }, { timeout: 30_000 }),
  );
  if (!result.ok) return { error: result.error };

  revalidateReceipts(result.value.id);
  redirect(`/finance/receipts/${result.value.id}`);
}

export async function postReceipt(id: string): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const txNo = await postCashReceipt(tx, id, user.id);
      const r = await tx.cashReceipt.findUniqueOrThrow({ where: { id }, select: { number: true } });
      await recordChange({ userId: user.id, entityType: "CashReceipt", entityId: id, action: "posted", message: `Receipt ${r.number} posted (transaction ${txNo})` }, tx);
    }, { timeout: 30_000 }),
  );
  if (!result.ok) return { error: result.error };
  revalidateReceipts(id);
  return undefined;
}

export async function cancelReceipt(id: string): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const reversal = await cancelCashReceipt(tx, id, user.id, todayIso());
      const r = await tx.cashReceipt.findUniqueOrThrow({ where: { id }, select: { number: true } });
      await recordChange(
        { userId: user.id, entityType: "CashReceipt", entityId: id, action: "cancelled", message: `Receipt ${r.number} cancelled${reversal ? ` (reversal transaction ${reversal})` : ""}` },
        tx,
      );
    }, { timeout: 30_000 }),
  );
  if (!result.ok) return { error: result.error };
  revalidateReceipts(id);
  return undefined;
}

export async function deleteDraftReceipt(id: string): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const r = await tx.cashReceipt.findUnique({ where: { id }, select: { number: true, status: true } });
      if (!r) throw new FinanceError("Receipt not found.");
      if (r.status !== "DRAFT") throw new FinanceError("Only draft receipts can be deleted. Cancel a posted receipt instead.");
      await tx.cashReceipt.delete({ where: { id } });
      await recordChange({ userId: user.id, entityType: "CashReceipt", entityId: id, action: "deleted", message: `Draft receipt ${r.number} deleted` }, tx);
    }),
  );
  if (!result.ok) return { error: result.error };
  revalidateReceipts();
  redirect("/finance/receipts");
}
