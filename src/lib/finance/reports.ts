import type { GlAccountType } from "@/generated/prisma/enums";
import { money } from "./chart";

/**
 * Pure builders for the financial statements (trial balance, Schedule III
 * profit & loss and balance sheet, indirect cash flow). They take the chart of
 * accounts plus per-account debit/credit totals (from `accountTotals()`), and
 * return plain rows for pages and Excel exports. Safe to import on the client.
 */

export type ReportAccount = {
  id: string;
  code: string;
  name: string;
  type: GlAccountType;
  category: string;
  isGroup: boolean;
  parentId: string | null;
  cashFlowGroup: string;
};

export type DebitCredit = { debit: number; credit: number };
/** Per-account totals keyed by account id. */
export type Totals = Map<string, DebitCredit> | Record<string, DebitCredit>;

const ZERO: DebitCredit = { debit: 0, credit: 0 };

function get(t: Totals, id: string): DebitCredit {
  return (t instanceof Map ? t.get(id) : t[id]) ?? ZERO;
}

/** Debit-positive net movement of an account. */
function net(t: Totals, id: string): number {
  const v = get(t, id);
  return v.debit - v.credit;
}

const isPnl = (a: ReportAccount) => a.type === "INCOME" || a.type === "EXPENSE";
const byCode = (a: { code: string }, b: { code: string }) => a.code.localeCompare(b.code, undefined, { numeric: true });
const sum = (xs: number[]) => money(xs.reduce((s, x) => s + x, 0));
const isZero = (n: number) => Math.abs(n) < 0.005;

/** Splits a debit-positive balance into Dr / Cr columns. */
export function drCr(balance: number): { dr: number; cr: number } {
  const b = money(balance);
  return b >= 0 ? { dr: b, cr: 0 } : { dr: 0, cr: -b };
}

// ── Trial balance ───────────────────────────────────────────────────────────

export type TrialBalanceRow = {
  id: string;
  code: string;
  name: string;
  type: GlAccountType;
  /** Debit-positive balances. */
  opening: number;
  debit: number;
  credit: number;
  closing: number;
};

export type TrialBalanceColumns = {
  openingDr: number;
  openingCr: number;
  debit: number;
  credit: number;
  closingDr: number;
  closingCr: number;
};

export type TrialBalanceGroup = {
  heading: { id: string; code: string; name: string } | null;
  rows: TrialBalanceRow[];
  subtotal: TrialBalanceColumns;
};

export type TrialBalance = {
  groups: TrialBalanceGroup[];
  totals: TrialBalanceColumns;
  /** Debits equal credits in every column pair. */
  balanced: boolean;
};

function columns(rows: TrialBalanceRow[]): TrialBalanceColumns {
  const c = { openingDr: 0, openingCr: 0, debit: 0, credit: 0, closingDr: 0, closingCr: 0 };
  for (const r of rows) {
    const o = drCr(r.opening);
    const cl = drCr(r.closing);
    c.openingDr += o.dr;
    c.openingCr += o.cr;
    c.debit += r.debit;
    c.credit += r.credit;
    c.closingDr += cl.dr;
    c.closingCr += cl.cr;
  }
  return {
    openingDr: money(c.openingDr),
    openingCr: money(c.openingCr),
    debit: money(c.debit),
    credit: money(c.credit),
    closingDr: money(c.closingDr),
    closingCr: money(c.closingCr),
  };
}

/** Top-level heading of an account (its root ancestor that is a heading). */
function rootHeading(account: ReportAccount, byId: Map<string, ReportAccount>): ReportAccount | null {
  let current: ReportAccount | undefined = account;
  let heading: ReportAccount | null = null;
  const seen = new Set<string>();
  while (current?.parentId && !seen.has(current.id)) {
    seen.add(current.id);
    current = byId.get(current.parentId);
    if (current?.isGroup) heading = current;
  }
  return heading;
}

/**
 * Trial balance: opening balance (entries before the period), period debits
 * and credits, and closing balance per posting account, grouped under their
 * top-level headings.
 */
export function buildTrialBalance(
  accounts: ReportAccount[],
  opening: Totals,
  period: Totals,
  opts: { hideZero?: boolean } = {},
): TrialBalance {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const groups = new Map<string, TrialBalanceGroup>();
  for (const a of [...accounts].sort(byCode)) {
    if (a.isGroup) continue;
    const o = money(net(opening, a.id));
    const p = get(period, a.id);
    const row: TrialBalanceRow = {
      id: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      opening: o,
      debit: money(p.debit),
      credit: money(p.credit),
      closing: money(o + p.debit - p.credit),
    };
    if (opts.hideZero && isZero(row.opening) && isZero(row.debit) && isZero(row.credit) && isZero(row.closing)) continue;
    const h = rootHeading(a, byId);
    const key = h?.id ?? "";
    if (!groups.has(key)) groups.set(key, { heading: h ? { id: h.id, code: h.code, name: h.name } : null, rows: [], subtotal: columns([]) });
    groups.get(key)!.rows.push(row);
  }
  const list = [...groups.values()].sort((x, y) => (x.heading?.code ?? "~").localeCompare(y.heading?.code ?? "~", undefined, { numeric: true }));
  for (const g of list) g.subtotal = columns(g.rows);
  const totals = columns(list.flatMap((g) => g.rows));
  const balanced =
    isZero(totals.openingDr - totals.openingCr) && isZero(totals.debit - totals.credit) && isZero(totals.closingDr - totals.closingCr);
  return { groups: list, totals, balanced };
}

// ── Profit & loss (Schedule III, Division II) ───────────────────────────────

export type StatementAccountLine = { id: string; code: string; name: string; amounts: number[] };

export type StatementLine = {
  key: string;
  label: string;
  /** "line" rows expand to accounts; "total" rows are bold subtotals; "heading" rows have no amounts. */
  kind: "heading" | "line" | "total";
  amounts: number[];
  accounts: StatementAccountLine[];
  /** Indentation level for display. */
  level?: number;
  note?: string;
};

export const PNL_INCOME_CATEGORIES = ["Revenue from operations", "Other income"] as const;
export const PNL_EXPENSE_CATEGORIES = [
  "Cost of materials consumed",
  "Purchases of stock-in-trade",
  "Changes in inventories",
  "Employee benefits expense",
  "Finance costs",
  "Depreciation & amortisation",
  "Other expenses",
] as const;

export type ProfitAndLoss = {
  lines: StatementLine[];
  totalIncome: number[];
  totalExpenses: number[];
  profitBeforeTax: number[];
};

function categoryLines(
  accounts: ReportAccount[],
  columnTotals: Totals[],
  categories: readonly string[],
  fallback: string,
  sign: (a: ReportAccount, t: Totals) => number,
): StatementLine[] {
  const lines = new Map<string, StatementLine>(
    categories.map((c) => [c, { key: c, label: c, kind: "line", amounts: columnTotals.map(() => 0), accounts: [], level: 1 }]),
  );
  for (const a of [...accounts].sort(byCode)) {
    if (a.isGroup) continue;
    const line = lines.get(categories.includes(a.category) ? a.category : fallback)!;
    const amounts = columnTotals.map((t) => money(sign(a, t)));
    if (amounts.every(isZero)) continue;
    line.accounts.push({ id: a.id, code: a.code, name: a.name, amounts });
    amounts.forEach((v, i) => (line.amounts[i] = money(line.amounts[i] + v)));
  }
  return [...lines.values()];
}

/**
 * Statement of profit and loss. Each entry of `columnTotals` is one column
 * (a period, its comparative, or a month) of per-account totals, which should
 * exclude the year-end closing transaction.
 */
export function buildProfitAndLoss(accounts: ReportAccount[], columnTotals: Totals[]): ProfitAndLoss {
  const income = accounts.filter((a) => a.type === "INCOME");
  const expense = accounts.filter((a) => a.type === "EXPENSE");
  const incomeLines = categoryLines(income, columnTotals, PNL_INCOME_CATEGORIES, "Other income", (a, t) => -net(t, a.id));
  const expenseLines = categoryLines(expense, columnTotals, PNL_EXPENSE_CATEGORIES, "Other expenses", (a, t) => net(t, a.id));
  const n = columnTotals.length;
  const col = (ls: StatementLine[], i: number) => sum(ls.map((l) => l.amounts[i]));
  const totalIncome = Array.from({ length: n }, (_, i) => col(incomeLines, i));
  const totalExpenses = Array.from({ length: n }, (_, i) => col(expenseLines, i));
  const profitBeforeTax = totalIncome.map((v, i) => money(v - totalExpenses[i]));
  const roman = ["I", "II"];
  const lines: StatementLine[] = [
    ...incomeLines.map((l, i) => ({ ...l, label: `${roman[i]}. ${l.label}`, level: 0 })),
    { key: "total-income", label: "III. Total income (I + II)", kind: "total", amounts: totalIncome, accounts: [] },
    { key: "expenses", label: "IV. Expenses", kind: "heading", amounts: [], accounts: [] },
    ...expenseLines,
    { key: "total-expenses", label: "Total expenses (IV)", kind: "total", amounts: totalExpenses, accounts: [] },
    { key: "pbt", label: "V. Profit before tax (III − IV)", kind: "total", amounts: profitBeforeTax, accounts: [] },
  ];
  return { lines, totalIncome, totalExpenses, profitBeforeTax };
}

// ── Balance sheet (Schedule III) ────────────────────────────────────────────

type BsSection = { key: string; label: string; categories: string[] };

export const BS_EQUITY_LIABILITIES: BsSection[] = [
  { key: "shareholders", label: "Shareholders' funds", categories: ["Share capital", "Reserves & surplus"] },
  { key: "noncurrent-liabilities", label: "Non-current liabilities", categories: ["Long-term borrowings", "Other long-term liabilities", "Long-term provisions"] },
  {
    key: "current-liabilities",
    label: "Current liabilities",
    categories: ["Short-term borrowings", "Trade payables", "Other current liabilities", "Short-term provisions"],
  },
];

export const BS_ASSETS: BsSection[] = [
  {
    key: "noncurrent-assets",
    label: "Non-current assets",
    categories: ["Property, plant & equipment", "Capital work-in-progress", "Intangible assets", "Non-current investments", "Long-term loans & advances"],
  },
  {
    key: "current-assets",
    label: "Current assets",
    categories: ["Current investments", "Inventories", "Trade receivables", "Cash & cash equivalents", "Short-term loans & advances", "Other current assets"],
  },
];

const BS_FALLBACK: Record<"ASSET" | "LIABILITY" | "EQUITY", string> = {
  ASSET: "Other current assets",
  LIABILITY: "Other current liabilities",
  EQUITY: "Reserves & surplus",
};
const NONCURRENT_LIABILITY = new Set(["Non-current liabilities"]);
const NONCURRENT_ASSET = new Set(["Non-current assets"]);

function bsCategory(a: ReportAccount, all: Set<string>): string {
  if (all.has(a.category)) return a.category;
  if (a.type === "LIABILITY" && NONCURRENT_LIABILITY.has(a.category)) return "Other long-term liabilities";
  if (a.type === "ASSET" && NONCURRENT_ASSET.has(a.category)) return "Long-term loans & advances";
  return BS_FALLBACK[a.type as "ASSET" | "LIABILITY" | "EQUITY"];
}

export type BalanceSheet = {
  lines: StatementLine[];
  totalEquityLiabilities: number[];
  totalAssets: number[];
  /** Assets − (equity + liabilities) per column; zero when the sheet agrees. */
  difference: number[];
  /** Profit not yet closed to retained earnings, included under reserves & surplus. */
  currentProfit: number[];
};

/**
 * Balance sheet as on each column date. `columnTotals` are cumulative totals
 * from the beginning up to that date (closing entries included). Income and
 * expense balances that have not been closed are shown as the current
 * year's profit within reserves & surplus.
 */
export function buildBalanceSheet(accounts: ReportAccount[], columnTotals: Totals[]): BalanceSheet {
  const n = columnTotals.length;
  const zeros = () => Array.from({ length: n }, () => 0);
  const currentProfit = columnTotals.map((t) => money(-sum(accounts.filter((a) => isPnl(a) && !a.isGroup).map((a) => net(t, a.id)))));

  const build = (sections: BsSection[], types: GlAccountType[], sign: number) => {
    const known = new Set(sections.flatMap((s) => s.categories));
    const byCategory = new Map<string, StatementLine>();
    for (const s of sections) {
      for (const c of s.categories) byCategory.set(c, { key: c, label: c, kind: "line", amounts: zeros(), accounts: [], level: 1 });
    }
    for (const a of [...accounts].sort(byCode)) {
      if (a.isGroup || !types.includes(a.type)) continue;
      const line = byCategory.get(bsCategory(a, known))!;
      const amounts = columnTotals.map((t) => money(sign * net(t, a.id)));
      if (amounts.every(isZero)) continue;
      line.accounts.push({ id: a.id, code: a.code, name: a.name, amounts });
      amounts.forEach((v, i) => (line.amounts[i] = money(line.amounts[i] + v)));
    }
    return { sections, byCategory };
  };

  const el = build(BS_EQUITY_LIABILITIES, ["EQUITY", "LIABILITY"], -1);
  const reserves = el.byCategory.get("Reserves & surplus")!;
  if (currentProfit.some((v) => !isZero(v))) {
    reserves.accounts.push({ id: "current-profit", code: "", name: "Surplus – profit for the year (not yet closed)", amounts: currentProfit });
    currentProfit.forEach((v, i) => (reserves.amounts[i] = money(reserves.amounts[i] + v)));
  }
  const as = build(BS_ASSETS, ["ASSET"], 1);

  const render = (part: ReturnType<typeof build>, totalLabel: string, totalKey: string) => {
    const lines: StatementLine[] = [];
    const sectionTotals: number[][] = [];
    for (const s of part.sections) {
      const ls = s.categories.map((c) => part.byCategory.get(c)!).filter((l, i) => i < 2 || l.amounts.some((v) => !isZero(v)) || l.accounts.length > 0);
      const total = Array.from({ length: n }, (_, i) => sum(ls.map((l) => l.amounts[i])));
      sectionTotals.push(total);
      lines.push({ key: s.key, label: s.label, kind: "heading", amounts: [], accounts: [] }, ...ls, {
        key: `${s.key}-total`,
        label: `Total ${s.label.toLowerCase()}`,
        kind: "total",
        amounts: total,
        accounts: [],
        level: 1,
      });
    }
    const grand = Array.from({ length: n }, (_, i) => sum(sectionTotals.map((t) => t[i])));
    lines.push({ key: totalKey, label: totalLabel, kind: "total", amounts: grand, accounts: [] });
    return { lines, grand };
  };

  const left = render(el, "TOTAL EQUITY AND LIABILITIES", "total-el");
  const right = render(as, "TOTAL ASSETS", "total-assets");
  const lines: StatementLine[] = [
    { key: "el", label: "I. EQUITY AND LIABILITIES", kind: "heading", amounts: [], accounts: [] },
    ...left.lines,
    { key: "assets", label: "II. ASSETS", kind: "heading", amounts: [], accounts: [] },
    ...right.lines,
  ];
  return {
    lines,
    totalEquityLiabilities: left.grand,
    totalAssets: right.grand,
    difference: right.grand.map((v, i) => money(v - left.grand[i])),
    currentProfit,
  };
}

// ── Cash flow statement (indirect method) ───────────────────────────────────

export type CashFlowLine = { key: string; label: string; amount: number; kind?: "line" | "total" | "heading" };

export type CashFlow = {
  profitBeforeTax: number;
  operating: CashFlowLine[];
  netOperating: number;
  investing: CashFlowLine[];
  netInvesting: number;
  financing: CashFlowLine[];
  netFinancing: number;
  netChange: number;
  openingCash: number;
  closingCash: number;
  /** closing − opening cash per the books. */
  cashMovement: number;
  /** netChange − cashMovement; zero when the statement reconciles. */
  difference: number;
};

const WC_ASSET_ORDER = ["Trade receivables", "Inventories", "Short-term loans & advances", "Other current assets"];
const WC_LIAB_ORDER = ["Trade payables", "Other current liabilities", "Short-term provisions"];

function grouped(entries: Array<{ label: string; amount: number }>, prefix: string): CashFlowLine[] {
  const m = new Map<string, number>();
  for (const e of entries) m.set(e.label, money((m.get(e.label) ?? 0) + e.amount));
  return [...m.entries()].filter(([, v]) => !isZero(v)).map(([label, amount]) => ({ key: `${prefix}:${label}`, label, amount }));
}

/**
 * Cash flow statement for a period, indirect method.
 * - `opening`: totals of all entries before the period (for the opening cash balance).
 * - `period`: totals of the period's entries, excluding the year-end closing transaction.
 *
 * Accounts are classified by `cashFlowGroup`: CASH accounts are the cash and
 * cash equivalents; balance-sheet OPERATING accounts are working capital;
 * INVESTING / FINANCING accounts go to those sections. Income and expense
 * accounts make up profit before tax; those marked NONE (depreciation,
 * profit / loss on sale of assets) are non-cash and added back, and those
 * marked INVESTING / FINANCING (e.g. interest expense) are added back and
 * shown in their section instead. Every account lands in exactly one place,
 * so the net change always equals the movement in cash.
 */
export function buildCashFlow(accounts: ReportAccount[], opening: Totals, period: Totals): CashFlow {
  const groups = new Set(["OPERATING", "INVESTING", "FINANCING", "CASH", "NONE"]);
  const posting = accounts
    .filter((a) => !a.isGroup)
    .map((a) => {
      const g = groups.has(a.cashFlowGroup) ? a.cashFlowGroup : "OPERATING";
      return { ...a, cashFlowGroup: isPnl(a) && g === "CASH" ? "OPERATING" : g };
    })
    .sort(byCode);
  const pnl = posting.filter(isPnl);
  const bs = posting.filter((a) => !isPnl(a));
  const cash = bs.filter((a) => a.cashFlowGroup === "CASH");

  const profitBeforeTax = money(-sum(pnl.map((a) => net(period, a.id))));

  // Adjustments for non-cash and non-operating items in profit.
  const adjustments: CashFlowLine[] = [];
  let nonCashPnl = 0;
  for (const a of pnl) {
    const d = money(net(period, a.id));
    if (isZero(d) || a.cashFlowGroup === "OPERATING") continue;
    const verb = d > 0 ? "Add" : "Less";
    adjustments.push({ key: `adj:${a.id}`, label: `${verb}: ${a.name}`, amount: d });
    if (a.cashFlowGroup !== "INVESTING" && a.cashFlowGroup !== "FINANCING") nonCashPnl = money(nonCashPnl + d);
  }

  // Working capital changes (balance-sheet operating accounts): a rise in an asset uses cash.
  const wc: Array<{ label: string; amount: number; order: number }> = [];
  for (const a of bs) {
    if (a.cashFlowGroup !== "OPERATING") continue;
    const d = money(net(period, a.id));
    if (isZero(d)) continue;
    const isAsset = a.type === "ASSET";
    const order = isAsset ? WC_ASSET_ORDER.indexOf(a.category) : 10 + WC_LIAB_ORDER.indexOf(a.category);
    const category = a.category || (isAsset ? "Other current assets" : "Other current liabilities");
    const label = isAsset ? `(Increase) / decrease in ${category.toLowerCase()}` : `Increase / (decrease) in ${category.toLowerCase()}`;
    wc.push({ label, amount: -d, order: order < 0 ? (isAsset ? 9 : 19) : order });
  }
  wc.sort((x, y) => x.order - y.order);
  const wcLines = grouped(wc, "wc");

  // Other non-cash balance-sheet movements (opening balances, retained earnings adjustments).
  const otherNone = money(sum(bs.filter((a) => a.cashFlowGroup === "NONE" && a.type !== "ASSET").map((a) => -net(period, a.id))));

  const operating: CashFlowLine[] = [
    { key: "pbt", label: "Profit before tax", amount: profitBeforeTax },
    ...adjustments,
    ...(wcLines.length ? [{ key: "wc", label: "Changes in working capital", amount: 0, kind: "heading" as const }, ...wcLines] : []),
    ...(isZero(otherNone) ? [] : [{ key: "other-none", label: "Other non-cash balance movements (opening balances, equity adjustments)", amount: otherNone }]),
  ];
  const netOperating = sum(operating.filter((l) => l.kind !== "heading").map((l) => l.amount));

  // Investing: INVESTING balance-sheet accounts, plus accumulated depreciation on
  // disposals net of the non-cash profit/loss already adjusted above.
  // Investing assets are shown gross: additions (debits) and disposals at cost (credits).
  const invAccounts = bs.filter((a) => a.cashFlowGroup === "INVESTING");
  const inv = [
    ...grouped(
      invAccounts.map((a) => ({
        label: a.type === "ASSET" ? `Purchase of ${a.category.toLowerCase()}` : `Increase / (decrease) in ${a.category.toLowerCase()}`,
        amount: a.type === "ASSET" ? -get(period, a.id).debit : -net(period, a.id),
      })),
      "inv-add",
    ),
    ...grouped(
      invAccounts.filter((a) => a.type === "ASSET").map((a) => ({ label: `Disposal of ${a.category.toLowerCase()} (at cost)`, amount: get(period, a.id).credit })),
      "inv-sale",
    ),
  ];
  const accumulated = money(sum(bs.filter((a) => a.cashFlowGroup === "NONE" && a.type === "ASSET").map((a) => -net(period, a.id))) - nonCashPnl);
  const pnlInvesting = pnl.filter((a) => a.cashFlowGroup === "INVESTING").map((a) => ({ label: a.name, amount: -net(period, a.id) }));
  const investing: CashFlowLine[] = [
    ...inv,
    ...grouped(pnlInvesting, "inv-pnl"),
    ...(isZero(accumulated) ? [] : [{ key: "inv-acc", label: "Less: accumulated depreciation and gain / loss on assets disposed", amount: accumulated }]),
  ];
  const netInvesting = sum(investing.map((l) => l.amount));

  const fin = bs
    .filter((a) => a.cashFlowGroup === "FINANCING")
    .map((a) => ({ label: `Proceeds from / (repayment of) ${a.category.toLowerCase()}`, amount: -net(period, a.id) }));
  const finPnl = pnl.filter((a) => a.cashFlowGroup === "FINANCING").map((a) => ({ label: `${a.name} paid`, amount: -net(period, a.id) }));
  const financing = [...grouped(fin, "fin"), ...grouped(finPnl, "fin-pnl")];
  const netFinancing = sum(financing.map((l) => l.amount));

  const netChange = money(netOperating + netInvesting + netFinancing);
  const openingCash = sum(cash.map((a) => net(opening, a.id)));
  const cashMovement = sum(cash.map((a) => net(period, a.id)));
  const closingCash = money(openingCash + cashMovement);
  return {
    profitBeforeTax,
    operating,
    netOperating,
    investing,
    netInvesting,
    financing,
    netFinancing,
    netChange,
    openingCash,
    closingCash,
    cashMovement,
    difference: money(netChange - cashMovement),
  };
}

// ── Helpers shared by the report pages ──────────────────────────────────────

/** Adds totals of two maps (e.g. opening + period → closing). */
export function addTotals(a: Totals, b: Totals): Map<string, DebitCredit> {
  const out = new Map<string, DebitCredit>();
  const put = (t: Totals) => {
    const entries = t instanceof Map ? [...t.entries()] : Object.entries(t);
    for (const [id, v] of entries) {
      const cur = out.get(id) ?? { debit: 0, credit: 0 };
      out.set(id, { debit: money(cur.debit + v.debit), credit: money(cur.credit + v.credit) });
    }
  };
  put(a);
  put(b);
  return out;
}

/** Same period one year earlier (e.g. 2026-04-01..2026-11-05 → 2025-04-01..2025-11-05). */
export function previousYearRange(from: string, to: string): { from: string; to: string } {
  const shift = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    const last = new Date(Date.UTC(y - 1, m, 0)).getUTCDate();
    return `${y - 1}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
  };
  return { from: shift(from), to: shift(to) };
}
