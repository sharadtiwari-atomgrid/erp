import "server-only";
import type { Tx } from "@/lib/db";
import { num } from "@/lib/format";
import { addDaysIso, dayFromIso, isoFromDay } from "@/lib/ops/dates";
import { vendorPaymentSplit } from "@/app/(app)/finance/_ar_ap/apply";
import { purchaseInvoicePostingLines, vendorPaymentPostingLines } from "@/app/(app)/finance/_ar_ap/postings";
import { taxableShare, tdsRateFor } from "@/app/(app)/finance/_ar_ap/tds";
import { money, tdsQuarterOf } from "./chart";
import { FinanceError, postTransaction, reverseTransaction } from "./posting";

/**
 * Purchase invoices (supplier bills) and vendor payments. Call inside a
 * db.$transaction.
 */

const EPS = 0.004;

/**
 * Posts a draft bill (status → POSTED):
 * Dr Purchases / expense or asset accounts (taxable value, plus GST when ITC is not eligible)
 * Dr Input CGST + SGST or IGST (ITC eligible) / Cr Payables (total).
 * Fills in the due date (supplier's payment terms) and place of supply (supplier's state) when blank.
 */
export async function postPurchaseInvoice(tx: Tx, invoiceId: string, userId: string | null) {
  const bill = await tx.purchaseInvoice.findUnique({
    where: { id: invoiceId },
    include: { lines: { orderBy: { position: "asc" } }, supplier: { select: { state: true, paymentTermsDays: true } } },
  });
  if (!bill) throw new FinanceError("Purchase invoice not found.");
  if (bill.status !== "DRAFT") throw new FinanceError("Only draft purchase invoices can be posted.");
  if (bill.lines.length === 0) throw new FinanceError("Add at least one line before posting.");
  if (num(bill.total) <= 0) throw new FinanceError("The bill total must be more than zero.");

  const company = await tx.companySettings.findUnique({ where: { id: 1 }, select: { state: true } });
  const placeOfSupply = bill.placeOfSupply ?? bill.supplier.state;
  const dueDate = bill.dueDate ?? dayFromIso(addDaysIso(isoFromDay(bill.invoiceDate), bill.supplier.paymentTermsDays));

  const transactionNo = await postTransaction(tx, {
    date: isoFromDay(bill.invoiceDate),
    documentType: "Purchase invoice",
    documentNo: bill.number,
    sourceType: "PurchaseInvoice",
    sourceId: bill.id,
    description: `Purchase invoice ${bill.number}${bill.supplierInvoiceNo ? ` (supplier inv. ${bill.supplierInvoiceNo})` : ""}`,
    contactId: bill.supplierId,
    branchId: bill.branchId,
    userId,
    lines: purchaseInvoicePostingLines({
      supplierId: bill.supplierId,
      lines: bill.lines.map((l) => ({ glAccountId: l.productId ? null : l.glAccountId, lineTotal: num(l.lineTotal), taxAmount: num(l.taxAmount) })),
      taxTotal: num(bill.taxTotal),
      total: num(bill.total),
      itcEligible: bill.itcEligible,
      companyState: company?.state,
      placeOfSupply,
    }),
  });

  await tx.purchaseInvoice.update({
    where: { id: bill.id },
    data: { status: "POSTED", transactionNo, placeOfSupply, dueDate },
  });
  return transactionNo;
}

/** Cancels a posted bill with no payments: reverses its posting on `dateIso`. */
export async function cancelPurchaseInvoice(tx: Tx, invoiceId: string, userId: string | null, dateIso: string) {
  const bill = await tx.purchaseInvoice.findUnique({
    where: { id: invoiceId },
    select: {
      number: true,
      status: true,
      amountPaid: true,
      transactionNo: true,
      _count: { select: { fixedAssets: true } },
      applications: { where: { payment: { status: { not: "CANCELLED" } } }, select: { id: true } },
    },
  });
  if (!bill) throw new FinanceError("Purchase invoice not found.");
  if (bill.status !== "POSTED") throw new FinanceError("Only posted bills with no payments can be cancelled.");
  if (num(bill.amountPaid) > EPS || bill.applications.length > 0) throw new FinanceError("This bill has payments. Cancel the payments first.");
  if (bill._count.fixedAssets > 0) throw new FinanceError("Fixed assets were created from this bill. Remove them first.");

  const reversalTx = bill.transactionNo
    ? await reverseTransaction(tx, bill.transactionNo, { date: dateIso, userId, reason: `Purchase invoice ${bill.number} cancelled` })
    : null;
  const { count } = await tx.purchaseInvoice.updateMany({ where: { id: invoiceId, status: "POSTED", amountPaid: 0 }, data: { status: "CANCELLED" } });
  if (count === 0) throw new FinanceError("This bill was just updated. Reload and try again.");
  return reversalTx;
}

/**
 * Posts a draft vendor payment: settles each applied bill (amountPaid and
 * status), records the TDS entry, and posts one transaction:
 * Dr Payables (applied incl. TDS) · Dr Supplier advances (unapplied) / Cr Bank (cash) · Cr TDS payable (TDS).
 */
export async function postVendorPayment(tx: Tx, paymentId: string, userId: string | null) {
  const payment = await tx.vendorPayment.findUnique({
    where: { id: paymentId },
    include: {
      applications: true,
      bankAccount: { select: { glAccountId: true, isActive: true, name: true } },
      tdsSection: true,
    },
  });
  if (!payment) throw new FinanceError("Payment not found.");
  if (payment.status !== "DRAFT") throw new FinanceError("Only draft payments can be posted.");
  if (!payment.bankAccount.isActive) throw new FinanceError(`${payment.bankAccount.name} is closed. Choose another bank account.`);

  const tds = num(payment.tdsAmount);
  const advance = num(payment.unappliedAmount);
  const applied = money(payment.applications.reduce((s, a) => s + num(a.amount), 0));
  const split = vendorPaymentSplit({ applied, tds, advance });
  if (!split.ok) throw new FinanceError(split.error);
  if (Math.abs(split.cash - num(payment.amount)) > EPS) throw new FinanceError("The payment amount does not match the applications. Reload and try again.");
  if (tds > 0 && !payment.tdsSection) throw new FinanceError("Choose the TDS section for the tax withheld.");

  let tdsBase = 0;
  for (const app of payment.applications) {
    const value = num(app.amount);
    const bill = await tx.purchaseInvoice.findUnique({
      where: { id: app.purchaseInvoiceId },
      select: { number: true, status: true, supplierId: true, subtotal: true, total: true, amountPaid: true },
    });
    if (!bill) throw new FinanceError("An applied bill no longer exists.");
    if (bill.supplierId !== payment.supplierId) throw new FinanceError(`${bill.number} belongs to another supplier.`);
    if (bill.status !== "POSTED" && bill.status !== "PARTIALLY_PAID") throw new FinanceError(`${bill.number} is not open for payment.`);
    const total = num(bill.total);
    const balance = money(total - num(bill.amountPaid));
    if (value > balance + EPS) throw new FinanceError(`${bill.number}: applied ${value.toFixed(2)} is more than its balance of ${balance.toFixed(2)}.`);
    tdsBase += taxableShare(value, { subtotal: num(bill.subtotal), total });

    const paid = money(num(bill.amountPaid) + value);
    const { count } = await tx.purchaseInvoice.updateMany({
      where: { id: app.purchaseInvoiceId, amountPaid: bill.amountPaid },
      data: { amountPaid: paid, status: paid >= total - EPS ? "PAID" : "PARTIALLY_PAID" },
    });
    if (count === 0) throw new FinanceError(`${bill.number} was just updated. Reload and try again.`);
  }

  const date = isoFromDay(payment.date);
  const transactionNo = await postTransaction(tx, {
    date,
    documentType: "Vendor payment",
    documentNo: payment.number,
    sourceType: "VendorPayment",
    sourceId: payment.id,
    description: `Payment ${payment.number}${payment.reference ? ` (${payment.reference})` : ""}`,
    contactId: payment.supplierId,
    userId,
    lines: vendorPaymentPostingLines({ bankGlAccountId: payment.bankAccount.glAccountId, supplierId: payment.supplierId, applied, tds, advance }),
  });

  if (tds > 0 && payment.tdsSection) {
    const supplier = await tx.contact.findUniqueOrThrow({ where: { id: payment.supplierId }, select: { pan: true, gstin: true } });
    await tx.tdsEntry.create({
      data: {
        kind: "TDS",
        sectionId: payment.tdsSection.id,
        contactId: payment.supplierId,
        date: payment.date,
        documentType: "Vendor payment",
        documentNo: payment.number,
        sourceId: payment.id,
        baseAmount: money(tdsBase),
        rate: tdsRateFor({ rateIndividual: num(payment.tdsSection.rateIndividual), rateCompany: num(payment.tdsSection.rateCompany) }, supplier),
        amount: tds,
        quarter: tdsQuarterOf(date),
      },
    });
  }

  await tx.vendorPayment.update({ where: { id: payment.id }, data: { status: "POSTED", transactionNo } });
  return transactionNo;
}

/**
 * Cancels a posted vendor payment: reverses its transaction on `dateIso`,
 * restores each bill's amountPaid and status, and removes its TDS entry
 * (refused once that TDS has been deposited).
 */
export async function cancelVendorPayment(tx: Tx, paymentId: string, userId: string | null, dateIso: string) {
  const payment = await tx.vendorPayment.findUnique({ where: { id: paymentId }, include: { applications: true } });
  if (!payment) throw new FinanceError("Payment not found.");
  if (payment.status !== "POSTED") throw new FinanceError("Only posted payments can be cancelled.");

  const tdsEntries = await tx.tdsEntry.findMany({ where: { sourceId: payment.id, documentType: "Vendor payment" }, select: { id: true, status: true } });
  if (tdsEntries.some((e) => e.status !== "PENDING")) throw new FinanceError("The TDS on this payment has already been deposited or filed, so it can’t be cancelled.");

  const reversalTx = payment.transactionNo
    ? await reverseTransaction(tx, payment.transactionNo, { date: dateIso, userId, reason: `Payment ${payment.number} cancelled` })
    : null;

  for (const app of payment.applications) {
    const bill = await tx.purchaseInvoice.findUnique({ where: { id: app.purchaseInvoiceId }, select: { number: true, amountPaid: true } });
    if (!bill) continue;
    const paid = Math.max(0, money(num(bill.amountPaid) - num(app.amount)));
    const { count } = await tx.purchaseInvoice.updateMany({
      where: { id: app.purchaseInvoiceId, amountPaid: bill.amountPaid },
      data: { amountPaid: paid, status: paid > EPS ? "PARTIALLY_PAID" : "POSTED" },
    });
    if (count === 0) throw new FinanceError(`${bill.number} was just updated. Reload and try again.`);
  }

  if (tdsEntries.length) await tx.tdsEntry.deleteMany({ where: { id: { in: tdsEntries.map((e) => e.id) } } });
  await tx.vendorPayment.update({ where: { id: payment.id }, data: { status: "CANCELLED" } });
  return reversalTx;
}
