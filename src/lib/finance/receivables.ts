import "server-only";
import type { Tx } from "@/lib/db";
import { num } from "@/lib/format";
import { isoFromDay } from "@/lib/ops/dates";
import { receiptSplit } from "@/app/(app)/finance/_ar_ap/apply";
import { receiptPostingLines } from "@/app/(app)/finance/_ar_ap/postings";
import { money } from "./chart";
import { FinanceError, postTransaction, reverseTransaction } from "./posting";

/**
 * Cash receipts (customer payments applied to sales invoices). Call inside a
 * db.$transaction.
 */

const EPS = 0.004;

/**
 * Posts a draft cash receipt: creates a Payment on every applied invoice
 * (updating amountPaid and status), then posts one transaction:
 * Dr Bank (amount) · Dr TDS receivable (TDS) / Cr Receivables (applied incl. TDS) · Cr Customer advances (unapplied).
 * The payments are not posted on their own: syncSalesLedger skips payments linked from receipt applications.
 */
export async function postCashReceipt(tx: Tx, receiptId: string, userId: string | null) {
  const receipt = await tx.cashReceipt.findUnique({
    where: { id: receiptId },
    include: { applications: true, bankAccount: { select: { glAccountId: true, isActive: true, name: true } } },
  });
  if (!receipt) throw new FinanceError("Receipt not found.");
  if (receipt.status !== "DRAFT") throw new FinanceError("Only draft receipts can be posted.");
  if (!receipt.bankAccount.isActive) throw new FinanceError(`${receipt.bankAccount.name} is closed. Choose another bank account.`);

  const amount = num(receipt.amount);
  const tds = num(receipt.tdsAmount);
  const applied = money(receipt.applications.reduce((s, a) => s + num(a.amount), 0));
  const split = receiptSplit({ amount, tds, applied });
  if (!split.ok) throw new FinanceError(split.error);

  const date = isoFromDay(receipt.date);
  const reference = [receipt.number, receipt.reference].filter(Boolean).join(" · ");

  for (const app of receipt.applications) {
    const value = num(app.amount);
    const invoice = await tx.invoice.findUnique({
      where: { id: app.invoiceId },
      select: { number: true, status: true, customerId: true, total: true, amountPaid: true },
    });
    if (!invoice) throw new FinanceError("An applied invoice no longer exists.");
    if (invoice.customerId !== receipt.customerId) throw new FinanceError(`${invoice.number} belongs to another customer.`);
    if (invoice.status !== "ISSUED" && invoice.status !== "PARTIALLY_PAID") throw new FinanceError(`${invoice.number} is not open for payment.`);
    const total = num(invoice.total);
    const balance = money(total - num(invoice.amountPaid));
    if (value > balance + EPS) throw new FinanceError(`${invoice.number}: applied ${value.toFixed(2)} is more than its balance of ${balance.toFixed(2)}.`);

    const paid = money(num(invoice.amountPaid) + value);
    // Same guard as recording a payment on the invoice: fail if someone else paid it meanwhile.
    const { count } = await tx.invoice.updateMany({
      where: { id: app.invoiceId, amountPaid: invoice.amountPaid },
      data: { amountPaid: paid, status: paid >= total - EPS ? "PAID" : "PARTIALLY_PAID" },
    });
    if (count === 0) throw new FinanceError(`${invoice.number} was just updated. Reload and try again.`);

    const payment = await tx.payment.create({
      data: {
        invoiceId: app.invoiceId,
        date: receipt.date,
        amount: value,
        method: receipt.method,
        reference,
        notes: `Cash receipt ${receipt.number}`,
        bankAccountId: receipt.bankAccountId,
      },
    });
    await tx.cashReceiptApplication.update({ where: { id: app.id }, data: { paymentId: payment.id } });
  }

  const transactionNo = await postTransaction(tx, {
    date,
    documentType: "Cash receipt",
    documentNo: receipt.number,
    sourceType: "CashReceipt",
    sourceId: receipt.id,
    description: `Receipt ${receipt.number}${receipt.reference ? ` (${receipt.reference})` : ""}`,
    contactId: receipt.customerId,
    userId,
    lines: receiptPostingLines({ bankGlAccountId: receipt.bankAccount.glAccountId, customerId: receipt.customerId, amount, tds, applied }),
  });

  await tx.cashReceipt.update({
    where: { id: receipt.id },
    data: { status: "POSTED", transactionNo, unappliedAmount: split.unapplied },
  });
  return transactionNo;
}

/**
 * Cancels a posted receipt: reverses its transaction on `dateIso`, removes
 * the payments it created and restores each invoice's amountPaid and status.
 */
export async function cancelCashReceipt(tx: Tx, receiptId: string, userId: string | null, dateIso: string) {
  const receipt = await tx.cashReceipt.findUnique({ where: { id: receiptId }, include: { applications: true } });
  if (!receipt) throw new FinanceError("Receipt not found.");
  if (receipt.status !== "POSTED") throw new FinanceError("Only posted receipts can be cancelled.");

  const reversalTx = receipt.transactionNo
    ? await reverseTransaction(tx, receipt.transactionNo, { date: dateIso, userId, reason: `Receipt ${receipt.number} cancelled` })
    : null;

  for (const app of receipt.applications) {
    if (!app.paymentId) continue;
    const value = num(app.amount);
    const invoice = await tx.invoice.findUnique({ where: { id: app.invoiceId }, select: { number: true, amountPaid: true } });
    if (invoice) {
      const paid = Math.max(0, money(num(invoice.amountPaid) - value));
      const { count } = await tx.invoice.updateMany({
        where: { id: app.invoiceId, amountPaid: invoice.amountPaid },
        data: { amountPaid: paid, status: paid > EPS ? "PARTIALLY_PAID" : "ISSUED" },
      });
      if (count === 0) throw new FinanceError(`${invoice.number} was just updated. Reload and try again.`);
    }
    await tx.payment.deleteMany({ where: { id: app.paymentId } });
    await tx.cashReceiptApplication.update({ where: { id: app.id }, data: { paymentId: null } });
  }

  await tx.cashReceipt.update({ where: { id: receipt.id }, data: { status: "CANCELLED", unappliedAmount: 0 } });
  return reversalTx;
}
