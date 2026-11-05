import type { GlAccountType } from "@/generated/prisma/enums";
import { money, normalBalance } from "@/lib/finance/chart";

/**
 * Pure General Ledger helpers shared by the chart of accounts, journals,
 * G/L entries and budgets pages. Safe to import on the client; tested in
 * ledger.test.ts.
 */

export const ACCOUNT_TYPES: GlAccountType[] = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];

export const ACCOUNT_TYPE_LABELS: Record<GlAccountType, string> = {
  ASSET: "Assets",
  LIABILITY: "Liabilities",
  EQUITY: "Equity",
  INCOME: "Income",
  EXPENSE: "Expenses",
};

export const CASH_FLOW_GROUPS = ["OPERATING", "INVESTING", "FINANCING", "CASH", "NONE"] as const;

export const JOURNAL_KINDS = ["General", "Opening balance", "Adjustment", "Contra", "Bank Payment", "Cash Payment", "Bank Receipt", "Cash Receipt"] as const;
export type JournalKind = (typeof JOURNAL_KINDS)[number];

export const JOURNAL_STATUS_TONE = { DRAFT: "gray", POSTED: "green", REVERSED: "amber" } as const;

/** Description that marks the automatic balancing line of an opening balance journal. */
export const OPENING_DIFFERENCE_TEXT = "Opening balance difference";

// ── Journals ────────────────────────────────────────────────────────────────

export type JournalLineDraft = {
  accountId: string;
  description?: string | null;
  debit: number;
  credit: number;
  contactId?: string | null;
  dimensions?: Record<string, string>;
};

/** Debit and credit totals and the difference (debit − credit), rounded to paise. */
export function journalTotals(lines: Array<{ debit: number; credit: number }>) {
  let debit = 0;
  let credit = 0;
  for (const l of lines) {
    debit += money(Number(l.debit) || 0);
    credit += money(Number(l.credit) || 0);
  }
  debit = money(debit);
  credit = money(credit);
  return { debit, credit, difference: money(debit - credit), balanced: debit === credit && debit > 0 };
}

/**
 * Drops empty lines and returns an error for the first invalid one. `forPosting`
 * also requires at least two lines that balance.
 */
export function validateJournalLines(
  raw: JournalLineDraft[],
  opts: { forPosting?: boolean } = {},
): { ok: true; lines: JournalLineDraft[] } | { ok: false; error: string } {
  const lines = raw
    .map((l) => ({ ...l, debit: money(Number(l.debit) || 0), credit: money(Number(l.credit) || 0) }))
    .filter((l) => l.accountId || l.debit !== 0 || l.credit !== 0);
  for (const [i, l] of lines.entries()) {
    const n = i + 1;
    if (!l.accountId) return { ok: false, error: `Line ${n}: choose an account.` };
    if (l.debit < 0 || l.credit < 0) return { ok: false, error: `Line ${n}: amounts cannot be negative.` };
    if (l.debit > 0 && l.credit > 0) return { ok: false, error: `Line ${n}: enter either a debit or a credit, not both.` };
    if (l.debit === 0 && l.credit === 0) return { ok: false, error: `Line ${n}: enter a debit or a credit amount.` };
  }
  if (lines.length === 0) return { ok: false, error: "Add at least one line." };
  if (opts.forPosting) {
    if (lines.length < 2) return { ok: false, error: "A journal needs at least two lines." };
    const t = journalTotals(lines);
    if (t.difference !== 0) {
      return { ok: false, error: `The journal does not balance: debits ${t.debit.toFixed(2)}, credits ${t.credit.toFixed(2)} (difference ${Math.abs(t.difference).toFixed(2)}).` };
    }
  }
  return { ok: true, lines };
}

/**
 * Opening balance journals balance automatically: any previous balancing line
 * is removed and a new one on the opening balance equity account takes up the
 * difference.
 */
export function withOpeningBalanceLine(lines: JournalLineDraft[], openingAccountId: string): JournalLineDraft[] {
  const kept = lines.filter((l) => !(l.accountId === openingAccountId && l.description === OPENING_DIFFERENCE_TEXT));
  const { difference } = journalTotals(kept);
  if (difference === 0) return kept;
  return [
    ...kept,
    {
      accountId: openingAccountId,
      description: OPENING_DIFFERENCE_TEXT,
      debit: difference < 0 ? -difference : 0,
      credit: difference > 0 ? difference : 0,
      dimensions: {},
    },
  ];
}

// ── Ledger ──────────────────────────────────────────────────────────────────

/** Adds a running balance (in the account's normal direction) to ledger entries in date order. */
export function withRunningBalance<T extends { debit: number; credit: number }>(
  entries: T[],
  type: GlAccountType,
  opening = 0,
): Array<T & { balance: number }> {
  let balance = money(opening);
  return entries.map((e) => {
    balance = money(balance + normalBalance(type, Number(e.debit) || 0, Number(e.credit) || 0));
    return { ...e, balance };
  });
}

// ── Chart of accounts tree ──────────────────────────────────────────────────

export type TreeAccount = {
  id: string;
  code: string;
  name: string;
  type: GlAccountType;
  parentId: string | null;
  isGroup: boolean;
};

export type TreeRow<A extends TreeAccount> = A & {
  depth: number;
  /** Own balance plus every descendant's, in the normal direction. */
  balance: number;
  debit: number;
  credit: number;
};

/**
 * Orders accounts as a tree (by type, then code, children under their
 * heading) and rolls each account's debit/credit totals up into its headings.
 */
export function buildAccountTree<A extends TreeAccount>(
  accounts: A[],
  totals: Map<string, { debit: number; credit: number }>,
): Array<TreeRow<A>> {
  const ids = new Set(accounts.map((a) => a.id));
  const children = new Map<string | null, A[]>();
  for (const a of accounts) {
    const parent = a.parentId && ids.has(a.parentId) ? a.parentId : null;
    const list = children.get(parent) ?? [];
    list.push(a);
    children.set(parent, list);
  }
  for (const list of children.values()) list.sort((x, y) => x.code.localeCompare(y.code, undefined, { numeric: true }));

  const out: Array<TreeRow<A>> = [];
  const visit = (a: A, depth: number): { debit: number; credit: number } => {
    const row: TreeRow<A> = { ...a, depth, balance: 0, debit: 0, credit: 0 };
    out.push(row);
    const own = totals.get(a.id) ?? { debit: 0, credit: 0 };
    let debit = own.debit;
    let credit = own.credit;
    for (const child of children.get(a.id) ?? []) {
      const t = visit(child, depth + 1);
      debit += t.debit;
      credit += t.credit;
    }
    row.debit = money(debit);
    row.credit = money(credit);
    row.balance = money(normalBalance(a.type, debit, credit));
    return { debit, credit };
  };

  const roots = children.get(null) ?? [];
  for (const type of ACCOUNT_TYPES) {
    for (const root of roots.filter((r) => r.type === type)) visit(root, 0);
  }
  return out;
}

/** Keeps rows that match and every heading above a match, preserving order. */
export function filterTree<A extends TreeAccount>(rows: Array<TreeRow<A>>, match: (row: TreeRow<A>) => boolean): Array<TreeRow<A>> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const keep = new Set<string>();
  for (const r of rows) {
    if (!match(r)) continue;
    let cur: TreeRow<A> | undefined = r;
    while (cur && !keep.has(cur.id)) {
      keep.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
  }
  return rows.filter((r) => keep.has(r.id));
}

/** Type totals in the normal direction from top-level rows. */
export function typeTotals<A extends TreeAccount>(rows: Array<TreeRow<A>>): Record<GlAccountType, number> {
  const out = { ASSET: 0, LIABILITY: 0, EQUITY: 0, INCOME: 0, EXPENSE: 0 } as Record<GlAccountType, number>;
  for (const r of rows) if (r.depth === 0) out[r.type] = money(out[r.type] + r.balance);
  return out;
}

// ── Source documents ────────────────────────────────────────────────────────

/**
 * Link to the document that produced a ledger entry. Payments link to their
 * invoice, so pass `paymentInvoice` (payment id → invoice id) for those.
 */
export function sourceHref(
  sourceType: string | null | undefined,
  sourceId: string | null | undefined,
  paymentInvoice?: Map<string, string>,
): string | null {
  if (!sourceType || !sourceId) return null;
  switch (sourceType) {
    case "Invoice":
      return `/sales/invoices/${sourceId}`;
    case "Journal":
      return `/finance/journals/${sourceId}`;
    case "CashReceipt":
      return `/finance/receipts/${sourceId}`;
    case "PurchaseInvoice":
      return `/finance/purchase-invoices/${sourceId}`;
    case "VendorPayment":
      return `/finance/vendor-payments/${sourceId}`;
    case "DepreciationRun":
      return `/finance/depreciation/${sourceId}`;
    case "FixedAsset":
      return `/finance/fixed-assets/${sourceId}`;
    case "FiscalYear":
      return `/finance/periods`;
    case "Payment": {
      const invoiceId = paymentInvoice?.get(sourceId);
      return invoiceId ? `/sales/invoices/${invoiceId}` : null;
    }
    default:
      return null;
  }
}

// ── Budgets ─────────────────────────────────────────────────────────────────

/** "YYYY-MM-01" for each month of the financial year starting in April of startYear. */
export function fiscalMonths(startYear: number): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = ((3 + i) % 12) + 1;
    const year = startYear + (i >= 9 ? 1 : 0);
    return `${year}-${String(month).padStart(2, "0")}-01`;
  });
}

export const monthLabel = (iso: string) =>
  `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}`;

/** Applies a % uplift to an amount, rounded to whole rupees. */
export function uplift(amount: number, pct: number): number {
  return Math.round(amount * (1 + (pct || 0) / 100));
}

export type BudgetActualInput = {
  accountId: string;
  type: GlAccountType;
  budget: number;
  debit: number;
  credit: number;
};

export type BudgetActualRow = {
  accountId: string;
  type: GlAccountType;
  budget: number;
  /** Normal-direction actual (income: credits − debits; expenses: debits − credits). */
  actual: number;
  /** actual − budget */
  variance: number;
  /** variance as % of budget; null when there is no budget. */
  variancePct: number | null;
  /** More income or less expense than budgeted. */
  favourable: boolean;
};

export function budgetVsActual(rows: BudgetActualInput[]): BudgetActualRow[] {
  return rows.map((r) => {
    const budget = money(r.budget);
    const actual = money(normalBalance(r.type, r.debit, r.credit));
    const variance = money(actual - budget);
    return {
      accountId: r.accountId,
      type: r.type,
      budget,
      actual,
      variance,
      variancePct: budget !== 0 ? Math.round((variance / Math.abs(budget)) * 1000) / 10 : null,
      favourable: r.type === "INCOME" ? variance >= 0 : variance <= 0,
    };
  });
}

/** Months to include: just `month`, or every month of the year up to and including it (YTD). */
export function monthsInView(months: string[], month: string, mode: "month" | "ytd"): string[] {
  if (mode === "month") return months.includes(month) ? [month] : [];
  const idx = months.indexOf(month);
  return idx < 0 ? [] : months.slice(0, idx + 1);
}

/** Net profit of a set of budget/actual rows (income − expenses). */
export function netOf(rows: Array<{ type: GlAccountType; budget: number; actual: number }>) {
  let budget = 0;
  let actual = 0;
  for (const r of rows) {
    const sign = r.type === "INCOME" ? 1 : r.type === "EXPENSE" ? -1 : 0;
    budget += sign * r.budget;
    actual += sign * r.actual;
  }
  return { budget: money(budget), actual: money(actual), variance: money(actual - budget) };
}

// ── Currencies ──────────────────────────────────────────────────────────────

/** Converts between currencies using rupees-per-unit rates (INR = 1). */
export function convert(amount: number, fromRate: number, toRate: number): number {
  if (!toRate) return 0;
  return Math.round(((amount * fromRate) / toRate) * 10000) / 10000;
}
