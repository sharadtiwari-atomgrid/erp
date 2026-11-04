import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { num } from "@/lib/format";
import { dayFromIso } from "@/lib/ops/dates";

/** Shared read helpers for finance pages. */

/** Accounts that can be posted to (not headings), for pickers. */
export async function getPostingAccountOptions(opts: { journalOnly?: boolean } = {}) {
  return db.glAccount.findMany({
    where: { isGroup: false, isActive: true, ...(opts.journalOnly ? { directPosting: true } : {}) },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, type: true },
  });
}

export async function getBankAccountOptions() {
  return db.bankAccount.findMany({
    where: { isActive: true },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    select: { id: true, code: true, name: true, kind: true, glAccountId: true },
  });
}

export type BalanceFilter = {
  /** Inclusive ISO dates; omit `from` for balances since the beginning. */
  from?: string;
  to?: string;
  branchId?: string | null;
  /** e.g. { DIVISION: "B2B" } — entries must carry every given dimension value. */
  dimensions?: Record<string, string>;
  /** Exclude the year-end closing transaction (for P&L views). */
  excludeClosing?: boolean;
};

export function glEntryWhere(f: BalanceFilter = {}): Prisma.GlEntryWhereInput {
  return {
    ...(f.from || f.to
      ? { postingDate: { ...(f.from ? { gte: dayFromIso(f.from) } : {}), ...(f.to ? { lte: dayFromIso(f.to) } : {}) } }
      : {}),
    ...(f.branchId ? { branchId: f.branchId } : {}),
    ...(f.excludeClosing ? { documentType: { not: "Year-end close" } } : {}),
    ...(f.dimensions && Object.keys(f.dimensions).length
      ? { AND: Object.entries(f.dimensions).map(([k, v]) => ({ dimensions: { path: [k], equals: v } })) }
      : {}),
  };
}

/** Debit and credit totals per account for the filter. */
export async function accountTotals(f: BalanceFilter = {}): Promise<Map<string, { debit: number; credit: number }>> {
  const rows = await db.glEntry.groupBy({ by: ["accountId"], where: glEntryWhere(f), _sum: { debit: true, credit: true } });
  return new Map(rows.map((r) => [r.accountId, { debit: num(r._sum.debit), credit: num(r._sum.credit) }]));
}

/** Issued sales invoices with an unpaid balance. */
export async function openReceivables(customerId?: string) {
  const invoices = await db.invoice.findMany({
    where: { status: { in: ["ISSUED", "PARTIALLY_PAID"] }, ...(customerId ? { customerId } : {}) },
    orderBy: { dueDate: "asc" },
    select: { id: true, number: true, issueDate: true, dueDate: true, total: true, amountPaid: true, customerId: true, customer: { select: { name: true } } },
  });
  return invoices.map((i) => ({ ...i, balance: num(i.total) - num(i.amountPaid) })).filter((i) => i.balance > 0.004);
}

/** Posted purchase invoices with an unpaid balance. */
export async function openPayables(supplierId?: string) {
  const bills = await db.purchaseInvoice.findMany({
    where: { status: { in: ["POSTED", "PARTIALLY_PAID"] }, ...(supplierId ? { supplierId } : {}) },
    orderBy: { dueDate: "asc" },
    select: { id: true, number: true, supplierInvoiceNo: true, invoiceDate: true, dueDate: true, total: true, amountPaid: true, supplierId: true, supplier: { select: { name: true } } },
  });
  return bills.map((b) => ({ ...b, balance: num(b.total) - num(b.amountPaid) })).filter((b) => b.balance > 0.004);
}
