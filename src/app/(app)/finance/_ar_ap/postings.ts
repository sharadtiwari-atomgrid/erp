/**
 * Ledger lines for receivables and payables documents, as pure functions so
 * they can be tested and previewed. src/lib/finance/receivables.ts and
 * payables.ts pass them to postTransaction.
 */

import { money, type PostingKey } from "@/lib/finance/chart";
import { splitGst } from "@/lib/totals";

export type LineAccount = PostingKey | { id: string };

export type LedgerLine = {
  account: LineAccount;
  debit?: number;
  credit?: number;
  contactId?: string | null;
  description?: string | null;
};

const sameAccount = (a: LineAccount, b: LineAccount) =>
  typeof a === "string" || typeof b === "string" ? a === b : a.id === b.id;

/** Adds `amount` to an existing debit line on the same account, or a new one. */
function addDebit(lines: LedgerLine[], account: LineAccount, amount: number, description?: string) {
  if (Math.abs(amount) < 0.005) return;
  const existing = lines.find((l) => sameAccount(l.account, account) && l.credit === undefined);
  if (existing) existing.debit = money((existing.debit ?? 0) + amount);
  else lines.push({ account, debit: money(amount), ...(description ? { description } : {}) });
}

/**
 * Cash receipt:
 *   Dr Bank (amount) · Dr TDS receivable (TDS)
 *   Cr Receivables (applied, which includes the TDS) · Cr Customer advances (unapplied)
 */
export function receiptPostingLines(input: {
  bankGlAccountId: string;
  customerId: string;
  amount: number;
  tds: number;
  /** Sum of applications (cash + TDS settled on invoices). */
  applied: number;
}): LedgerLine[] {
  const amount = money(input.amount);
  const tds = money(input.tds);
  const applied = money(input.applied);
  const unapplied = money(amount + tds - applied);
  if (unapplied < -0.004) throw new Error("Applied amount is more than the amount received plus TDS.");
  const lines: LedgerLine[] = [{ account: { id: input.bankGlAccountId }, debit: amount }];
  if (tds > 0) lines.push({ account: "TDS_RECEIVABLE", debit: tds, contactId: input.customerId });
  if (applied > 0) lines.push({ account: "RECEIVABLES", credit: applied, contactId: input.customerId });
  if (unapplied > 0) lines.push({ account: "CUSTOMER_ADVANCES", credit: unapplied, contactId: input.customerId, description: "Customer advance (unapplied)" });
  return lines;
}

export type BillLineForPosting = {
  /** Item lines post to Purchases; expense / asset lines to their ledger account. */
  glAccountId: string | null;
  lineTotal: number;
  taxAmount: number;
};

/**
 * Purchase invoice:
 *   Dr Purchases / expense or asset accounts (taxable value; plus GST when ITC is not eligible)
 *   Dr Input CGST + SGST, or IGST (when ITC is eligible)
 *   Cr Payables (total)
 */
export function purchaseInvoicePostingLines(input: {
  supplierId: string;
  lines: BillLineForPosting[];
  taxTotal: number;
  total: number;
  itcEligible: boolean;
  companyState: string | null | undefined;
  placeOfSupply: string | null | undefined;
}): LedgerLine[] {
  const lines: LedgerLine[] = [];
  for (const l of input.lines) {
    const account: LineAccount = l.glAccountId ? { id: l.glAccountId } : "PURCHASES";
    addDebit(lines, account, money(l.lineTotal + (input.itcEligible ? 0 : l.taxAmount)));
  }
  const tax = money(input.taxTotal);
  if (input.itcEligible && tax > 0) {
    const gst = splitGst(tax, input.companyState, input.placeOfSupply);
    if (gst.cgst) lines.push({ account: "INPUT_CGST", debit: gst.cgst });
    if (gst.sgst) lines.push({ account: "INPUT_SGST", debit: gst.sgst });
    if (gst.igst) lines.push({ account: "INPUT_IGST", debit: gst.igst });
  }
  const total = money(input.total);
  const debits = money(lines.reduce((s, l) => s + (l.debit ?? 0), 0));
  const rounding = money(total - debits);
  if (rounding > 0) lines.push({ account: "ROUNDING", debit: rounding });
  if (rounding < 0) lines.push({ account: "ROUNDING", credit: -rounding });
  lines.push({ account: "PAYABLES", credit: total, contactId: input.supplierId });
  return lines;
}

/**
 * Vendor payment:
 *   Dr Payables (applied, which includes the TDS) · Dr Supplier advances (unapplied)
 *   Cr Bank (cash paid) · Cr TDS payable (TDS)
 */
export function vendorPaymentPostingLines(input: {
  bankGlAccountId: string;
  supplierId: string;
  applied: number;
  tds: number;
  advance: number;
}): LedgerLine[] {
  const applied = money(input.applied);
  const tds = money(input.tds);
  const advance = money(input.advance);
  const cash = money(applied - tds + advance);
  if (cash <= 0) throw new Error("Nothing is paid out of the bank.");
  const lines: LedgerLine[] = [];
  if (applied > 0) lines.push({ account: "PAYABLES", debit: applied, contactId: input.supplierId });
  if (advance > 0) lines.push({ account: "SUPPLIER_ADVANCES", debit: advance, contactId: input.supplierId, description: "Advance to vendor (unapplied)" });
  lines.push({ account: { id: input.bankGlAccountId }, credit: cash });
  if (tds > 0) lines.push({ account: "TDS_PAYABLE", credit: tds, contactId: input.supplierId });
  return lines;
}
