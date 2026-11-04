import "server-only";
import { db } from "@/lib/db";
import { getBranchScope } from "@/lib/branch";
import { money, periodsOf, fiscalYearOf } from "@/lib/finance/chart";
import { accountTotals } from "@/lib/finance/queries";
import { num } from "@/lib/format";
import { addDaysIso, dayFromIso, isoFromDay, todayIso } from "@/lib/ops/dates";
import { loadGstReturns } from "../gst-returns/_lib/load";

const RECENT_TYPES = ["Journal", "Cash receipt", "Payment", "Vendor payment", "TDS challan", "TCS challan"];

/** Last `n` calendar months (oldest first) up to the month of `today`. */
function lastMonths(today: string, n: number) {
  const fy = fiscalYearOf(today);
  const all = [...periodsOf(fy.startYear - 1), ...periodsOf(fy.startYear)];
  const idx = all.findIndex((p) => p.start <= today && today <= p.end);
  return all.slice(Math.max(0, idx - n + 1), idx + 1);
}

/** Everything the finance overview shows, scoped to the header's branch for ledger and documents. */
export async function loadOverview() {
  const today = todayIso();
  const { branchId } = await getBranchScope();
  const branch = branchId ? { branchId } : {};
  const months = lastMonths(today, 6);
  const thisMonth = months.at(-1)!;
  const weekEnd = addDaysIso(today, 7);
  const soon = addDaysIso(today, 14);

  const [accounts, allTime, monthly, invoices, bills, tds, recentEntries, gst] = await Promise.all([
    db.glAccount.findMany({ where: { isGroup: false }, select: { id: true, type: true, cashFlowGroup: true } }),
    accountTotals({ branchId }),
    Promise.all(months.map((m) => accountTotals({ from: m.start, to: m.end, branchId, excludeClosing: true }))),
    db.invoice.findMany({
      where: { status: { in: ["ISSUED", "PARTIALLY_PAID"] }, ...branch },
      select: { id: true, number: true, dueDate: true, total: true, amountPaid: true, customer: { select: { id: true, name: true } } },
    }),
    db.purchaseInvoice.findMany({
      where: { status: { in: ["POSTED", "PARTIALLY_PAID"] }, ...branch },
      orderBy: { dueDate: "asc" },
      select: { id: true, number: true, supplierInvoiceNo: true, dueDate: true, total: true, amountPaid: true, supplier: { select: { name: true } } },
    }),
    db.tdsEntry.groupBy({ by: ["kind"], where: { status: "PENDING" }, _sum: { amount: true }, _count: true }),
    db.glEntry.findMany({
      where: { documentType: { in: RECENT_TYPES }, ...branch },
      orderBy: { transactionNo: "desc" },
      take: 80,
      select: { transactionNo: true, postingDate: true, documentType: true, documentNo: true, description: true, debit: true, contact: { select: { name: true } } },
    }),
    loadGstReturns(thisMonth.start.slice(0, 7)),
  ]);

  const cash = accounts.filter((a) => a.cashFlowGroup === "CASH");
  const balance = (id: string) => {
    const t = allTime.get(id);
    return t ? t.debit - t.credit : 0;
  };
  const cashBalance = money(cash.reduce((s, a) => s + balance(a.id), 0));

  const series = months.map((m, i) => {
    const t = monthly[i];
    let income = 0;
    let expense = 0;
    for (const a of accounts) {
      const v = t.get(a.id);
      if (!v) continue;
      if (a.type === "INCOME") income += v.credit - v.debit;
      if (a.type === "EXPENSE") expense += v.debit - v.credit;
    }
    return { label: m.name.slice(0, 3), month: m.name, income: money(income), expense: money(expense) };
  });
  const current = series.at(-1)!;

  const open = invoices
    .map((i) => ({ ...i, balance: money(num(i.total) - num(i.amountPaid)), due: isoFromDay(i.dueDate) }))
    .filter((i) => i.balance > 0.004);
  const overdue = open.filter((i) => i.due && i.due < today);
  const byCustomer = new Map<string, { id: string; name: string; amount: number; invoices: number; oldestDue: string }>();
  for (const i of overdue) {
    const c = byCustomer.get(i.customer.id) ?? { id: i.customer.id, name: i.customer.name, amount: 0, invoices: 0, oldestDue: i.due };
    c.amount = money(c.amount + i.balance);
    c.invoices += 1;
    if (i.due < c.oldestDue) c.oldestDue = i.due;
    byCustomer.set(i.customer.id, c);
  }

  const openBills = bills.map((b) => ({ ...b, balance: money(num(b.total) - num(b.amountPaid)), due: isoFromDay(b.dueDate) })).filter((b) => b.balance > 0.004);
  const dueThisWeek = openBills.filter((b) => b.due && b.due <= weekEnd);

  const txs = new Map<number, { transactionNo: number; date: string; type: string; documentNo: string | null; description: string | null; party: string | null; amount: number }>();
  for (const e of recentEntries) {
    const t = txs.get(e.transactionNo) ?? {
      transactionNo: e.transactionNo,
      date: isoFromDay(e.postingDate),
      type: e.documentType,
      documentNo: e.documentNo,
      description: e.description,
      party: e.contact?.name ?? null,
      amount: 0,
    };
    t.amount = money(t.amount + num(e.debit));
    if (!t.party && e.contact) t.party = e.contact.name;
    txs.set(e.transactionNo, t);
  }

  const out = gst.gstr3b.outward;
  const itc = gst.gstr3b.itc;
  const tdsPending = (k: string) => ({ amount: num(tds.find((t) => t.kind === k)?._sum.amount), count: tds.find((t) => t.kind === k)?._count ?? 0 });

  return {
    today,
    branchScoped: !!branchId,
    thisMonth: thisMonth.name,
    cashBalance,
    cashAccounts: cash.length,
    receivables: { total: money(open.reduce((s, i) => s + i.balance, 0)), count: open.length, overdue: money(overdue.reduce((s, i) => s + i.balance, 0)), overdueCount: overdue.length },
    payables: { total: money(openBills.reduce((s, b) => s + b.balance, 0)), count: openBills.length, dueThisWeek: money(dueThisWeek.reduce((s, b) => s + b.balance, 0)), dueThisWeekCount: dueThisWeek.length },
    month: { revenue: current.income, expenses: current.expense, profit: money(current.income - current.expense) },
    gst: { output: money(out.igst + out.cgst + out.sgst), itc: money(itc.igst + itc.cgst + itc.sgst), payable: money(out.igst + out.cgst + out.sgst - itc.igst - itc.cgst - itc.sgst), period: thisMonth.start.slice(0, 7) },
    tds: tdsPending("TDS"),
    tcs: tdsPending("TCS"),
    series,
    topOverdue: [...byCustomer.values()].sort((a, b) => b.amount - a.amount).slice(0, 6),
    billsDueSoon: openBills.filter((b) => !b.due || b.due <= soon).slice(0, 8),
    recent: [...txs.values()].slice(0, 8),
  };
}

export type Overview = Awaited<ReturnType<typeof loadOverview>>;

/** Days a due date is past today (positive) — for the overdue panel. */
export function daysPast(due: string, today: string): number {
  return Math.round((dayFromIso(today).getTime() - dayFromIso(due).getTime()) / 86_400_000);
}
