import "server-only";
import { db, type Tx } from "@/lib/db";
import { num } from "@/lib/format";
import { isoFromDay } from "@/lib/ops/dates";
import { round2, splitGst } from "@/lib/totals";
import { money } from "./chart";
import { findPostedTransaction, postTransaction, reverseSource, type PostingLineInput } from "./posting";

/**
 * Ledger postings for the existing sales documents. Each function is
 * idempotent: a document that is already posted is not posted twice.
 */

/** Bank / cash account a payment goes to: the chosen one, else cash for CASH payments, else the default bank. */
export async function paymentBankGlAccount(tx: Tx, bankAccountId: string | null | undefined, method: string) {
  if (bankAccountId) {
    const bank = await tx.bankAccount.findUnique({ where: { id: bankAccountId }, select: { glAccountId: true } });
    if (bank) return { id: bank.glAccountId };
  }
  return method === "CASH" ? ("CASH" as const) : ("BANK" as const);
}

/**
 * Sales invoice: Dr Trade receivables (total) / Cr Sales – goods or services
 * (taxable value) / Cr Output CGST+SGST or IGST / rounding to Rounding off.
 */
export async function postSalesInvoice(tx: Tx, invoiceId: string, userId: string | null) {
  if (await findPostedTransaction(tx, "Invoice", invoiceId)) return null;
  const invoice = await tx.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { lines: { include: { product: { select: { type: true } } } } },
  });
  const company = await tx.companySettings.findUnique({ where: { id: 1 }, select: { state: true } });

  const goods = round2(invoice.lines.filter((l) => l.product.type !== "SERVICE").reduce((s, l) => s + num(l.lineTotal), 0));
  const services = round2(invoice.lines.filter((l) => l.product.type === "SERVICE").reduce((s, l) => s + num(l.lineTotal), 0));
  const tax = num(invoice.taxTotal);
  const total = num(invoice.total);
  const gst = splitGst(tax, company?.state, invoice.placeOfSupply);
  const rounding = money(total - goods - services - gst.cgst - gst.sgst - gst.igst);

  const lines: PostingLineInput[] = [
    { account: "RECEIVABLES", debit: total, contactId: invoice.customerId },
    { account: "SALES_GOODS", credit: goods },
    { account: "SALES_SERVICES", credit: services },
    { account: "OUTPUT_CGST", credit: gst.cgst },
    { account: "OUTPUT_SGST", credit: gst.sgst },
    { account: "OUTPUT_IGST", credit: gst.igst },
  ];
  if (rounding > 0) lines.push({ account: "ROUNDING", credit: rounding });
  if (rounding < 0) lines.push({ account: "ROUNDING", debit: -rounding });

  return postTransaction(tx, {
    date: isoFromDay(invoice.issueDate),
    documentType: "Sales invoice",
    documentNo: invoice.number,
    sourceType: "Invoice",
    sourceId: invoice.id,
    description: `Sales invoice ${invoice.number}`,
    contactId: invoice.customerId,
    branchId: invoice.branchId,
    dimensions: { DIVISION: "B2B" },
    userId,
    lines,
  });
}

/** Cancelled invoice: reverses its posting on the cancellation date. */
export async function reverseSalesInvoice(tx: Tx, invoiceId: string, userId: string | null, dateIso: string) {
  return reverseSource(tx, "Invoice", invoiceId, { date: dateIso, userId, reason: "Invoice cancelled" });
}

/** Customer payment against an invoice: Dr Bank/Cash / Cr Trade receivables. */
export async function postInvoicePayment(tx: Tx, paymentId: string, userId: string | null) {
  if (await findPostedTransaction(tx, "Payment", paymentId)) return null;
  const payment = await tx.payment.findUniqueOrThrow({
    where: { id: paymentId },
    include: { invoice: { select: { number: true, customerId: true, branchId: true } } },
  });
  const amount = num(payment.amount);
  return postTransaction(tx, {
    date: isoFromDay(payment.date),
    documentType: "Payment",
    documentNo: payment.invoice.number,
    sourceType: "Payment",
    sourceId: payment.id,
    description: `Payment for ${payment.invoice.number}${payment.reference ? ` (${payment.reference})` : ""}`,
    contactId: payment.invoice.customerId,
    branchId: payment.invoice.branchId,
    dimensions: { DIVISION: "B2B" },
    userId,
    lines: [
      { account: await paymentBankGlAccount(tx, payment.bankAccountId, payment.method), debit: amount },
      { account: "RECEIVABLES", credit: amount, contactId: payment.invoice.customerId },
    ],
  });
}

/**
 * Posts sales invoices and payments recorded before the ledger existed (or
 * while posting failed). Payments made through cash receipts are skipped:
 * their receipt posts them. Returns how many documents were posted.
 */
export async function syncSalesLedger(userId: string | null) {
  const invoices = await db.invoice.findMany({
    where: { status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID"] } },
    select: { id: true },
    orderBy: { issueDate: "asc" },
  });
  const payments = await db.payment.findMany({
    where: { invoice: { status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID"] } } },
    select: { id: true },
    orderBy: { date: "asc" },
  });
  const viaReceipts = new Set(
    (await db.cashReceiptApplication.findMany({ where: { paymentId: { not: null } }, select: { paymentId: true } })).map((a) => a.paymentId),
  );
  let posted = 0;
  for (const inv of invoices) {
    if (await db.$transaction((tx) => postSalesInvoice(tx, inv.id, userId))) posted++;
  }
  for (const p of payments) {
    if (viaReceipts.has(p.id)) continue;
    if (await db.$transaction((tx) => postInvoicePayment(tx, p.id, userId))) posted++;
  }
  return posted;
}
