import { describe, expect, it } from "vitest";
import { DEFAULT_ACCOUNTS, assertBalanced } from "./chart";
import {
  addTotals,
  buildBalanceSheet,
  buildCashFlow,
  buildProfitAndLoss,
  buildTrialBalance,
  drCr,
  previousYearRange,
  type DebitCredit,
  type ReportAccount,
} from "./reports";

// Fictional company ledger built on the default chart (account id = code).
const accounts: ReportAccount[] = DEFAULT_ACCOUNTS.map((a) => ({
  id: a.code,
  code: a.code,
  name: a.name,
  type: a.type,
  category: a.category,
  isGroup: !!a.isGroup,
  parentId: a.parent ?? null,
  cashFlowGroup: a.cashFlowGroup ?? "OPERATING",
}));

type Line = { code: string; debit?: number; credit?: number };
type Tx = { date: string; type?: string; lines: Line[] };

const ledger: Tx[] = [
  // Opening balances, last year.
  { date: "2025-04-01", type: "Opening", lines: [{ code: "1441", debit: 500000 }, { code: "1120", debit: 300000 }, { code: "3100", credit: 600000 }, { code: "3300", credit: 200000 }] },
  // Last year trading: sale 100000 + IGST, purchase 40000, rent 10000.
  { date: "2025-06-10", lines: [{ code: "1420", debit: 118000 }, { code: "4100", credit: 100000 }, { code: "2222", credit: 18000 }] },
  { date: "2025-07-15", lines: [{ code: "5100", debit: 40000 }, { code: "1452", debit: 7200 }, { code: "2210", credit: 47200 }] },
  { date: "2025-08-01", lines: [{ code: "6210", debit: 10000 }, { code: "1441", credit: 10000 }] },
  { date: "2025-09-30", lines: [{ code: "1441", debit: 118000 }, { code: "1420", credit: 118000 }] },
  // Year-end close of FY 2025-26: profit 50000 to retained earnings.
  { date: "2026-03-31", type: "Year-end close", lines: [{ code: "4100", debit: 100000 }, { code: "5100", credit: 40000 }, { code: "6210", credit: 10000 }, { code: "3200", credit: 50000 }] },
  // This year (FY 2026-27).
  { date: "2026-04-05", lines: [{ code: "1420", debit: 236000 }, { code: "4100", credit: 200000 }, { code: "2220", credit: 18000 }, { code: "2221", credit: 18000 }] },
  { date: "2026-04-20", lines: [{ code: "1410", debit: 60000 }, { code: "1450", debit: 5400 }, { code: "1451", debit: 5400 }, { code: "2210", credit: 70800 }] },
  { date: "2026-05-02", lines: [{ code: "6100", debit: 45000 }, { code: "1441", credit: 45000 }] },
  { date: "2026-05-10", lines: [{ code: "1441", debit: 150000 }, { code: "1420", credit: 150000 }] },
  { date: "2026-05-15", lines: [{ code: "2210", debit: 47200 }, { code: "1441", credit: 47200 }] },
  { date: "2026-06-01", lines: [{ code: "1150", debit: 80000 }, { code: "1441", credit: 80000 }] },
  { date: "2026-06-30", lines: [{ code: "6300", debit: 12000 }, { code: "1190", credit: 12000 }] },
  { date: "2026-07-01", lines: [{ code: "1441", debit: 250000 }, { code: "2100", credit: 250000 }] },
  { date: "2026-07-31", lines: [{ code: "6400", debit: 3000 }, { code: "1441", credit: 3000 }] },
  { date: "2026-08-15", lines: [{ code: "1430", debit: 5000 }, { code: "1441", credit: 5000 }] },
  // Sell plant costing 100000 (40000 depreciated) for 70000: profit 10000.
  { date: "2026-08-20", lines: [{ code: "1190", debit: 40000 }, { code: "1441", debit: 70000 }, { code: "1120", credit: 100000 }, { code: "4220", credit: 10000 }] },
  // Sell an old vehicle: cost 20000, depreciated 5000, sold 12000, loss 3000.
  { date: "2026-09-05", lines: [{ code: "1190", debit: 5000 }, { code: "1441", debit: 12000 }, { code: "6910", debit: 3000 }, { code: "1140", credit: 20000 }] },
  { date: "2026-09-10", lines: [{ code: "6210", debit: 12000 }, { code: "2260", credit: 12000 }] },
  { date: "2026-10-01", lines: [{ code: "4210", credit: 1500 }, { code: "1441", debit: 1500 }] },
  { date: "2026-10-05", lines: [{ code: "1470", debit: 25000 }, { code: "1441", credit: 25000 }] },
];

for (const t of ledger) assertBalanced(t.lines);

function totals(filter: (t: Tx) => boolean): Map<string, DebitCredit> {
  const out = new Map<string, DebitCredit>();
  for (const t of ledger.filter(filter)) {
    for (const l of t.lines) {
      const cur = out.get(l.code) ?? { debit: 0, credit: 0 };
      out.set(l.code, { debit: cur.debit + (l.debit ?? 0), credit: cur.credit + (l.credit ?? 0) });
    }
  }
  return out;
}

const before = (iso: string) => (t: Tx) => t.date < iso;
const between = (from: string, to: string, excludeClosing = false) => (t: Tx) =>
  t.date >= from && t.date <= to && !(excludeClosing && t.type === "Year-end close");
const upTo = (iso: string) => (t: Tx) => t.date <= iso;

describe("trial balance", () => {
  const tb = buildTrialBalance(accounts, totals(before("2026-04-01")), totals(between("2026-04-01", "2026-11-05")), { hideZero: true });

  it("balances in every column", () => {
    expect(tb.balanced).toBe(true);
    expect(tb.totals.openingDr).toBe(tb.totals.openingCr);
    expect(tb.totals.debit).toBe(tb.totals.credit);
    expect(tb.totals.closingDr).toBe(tb.totals.closingCr);
  });

  it("groups accounts under their top-level headings with subtotals", () => {
    const headings = tb.groups.map((g) => g.heading?.code);
    expect(headings).toEqual(["1000", "1400", "2000", "2200", "3000", "4000", "4200", "6000"]);
    const nonCurrent = tb.groups[0];
    expect(nonCurrent.rows.map((r) => r.code)).toEqual(["1120", "1140", "1150", "1190"]);
    const sumClosing = nonCurrent.rows.reduce((s, r) => s + drCr(r.closing).dr, 0);
    expect(nonCurrent.subtotal.closingDr).toBe(sumClosing);
  });

  it("computes opening, movement and closing per account", () => {
    const bank = tb.groups.flatMap((g) => g.rows).find((r) => r.code === "1441")!;
    expect(bank.opening).toBe(608000);
    expect(bank.debit).toBe(150000 + 250000 + 70000 + 12000 + 1500);
    expect(bank.closing).toBe(bank.opening + bank.debit - bank.credit);
    const sales = tb.groups.flatMap((g) => g.rows).find((r) => r.code === "4100")!;
    expect(sales.opening).toBe(0); // closed into retained earnings
    expect(drCr(sales.closing)).toEqual({ dr: 0, cr: 200000 });
  });

  it("hides zero balances on request and still balances without the filter", () => {
    const all = buildTrialBalance(accounts, totals(before("2026-04-01")), totals(between("2026-04-01", "2026-11-05")));
    expect(all.groups.flatMap((g) => g.rows).length).toBeGreaterThan(tb.groups.flatMap((g) => g.rows).length);
    expect(all.balanced).toBe(true);
    expect(tb.groups.flatMap((g) => g.rows).some((r) => r.code === "1130")).toBe(false);
  });

  it("flags an unbalanced set of totals", () => {
    const broken = totals(between("2026-04-01", "2026-11-05"));
    broken.set("1441", { debit: 1, credit: 0 });
    expect(buildTrialBalance(accounts, new Map(), broken).balanced).toBe(false);
  });
});

describe("profit and loss", () => {
  const current = totals(between("2026-04-01", "2026-11-05", true));
  const range = previousYearRange("2026-04-01", "2026-11-05");
  const previous = totals(between(range.from, range.to, true));
  const pnl = buildProfitAndLoss(accounts, [current, previous]);
  const line = (key: string) => pnl.lines.find((l) => l.key === key)!;

  it("builds Schedule III lines from account categories", () => {
    expect(line("Revenue from operations").amounts).toEqual([200000, 100000]);
    expect(line("Other income").amounts).toEqual([11500, 0]);
    expect(pnl.totalIncome).toEqual([211500, 100000]);
    expect(line("Employee benefits expense").amounts[0]).toBe(45000);
    expect(line("Finance costs").amounts[0]).toBe(3000);
    expect(line("Depreciation & amortisation").amounts[0]).toBe(12000);
    expect(line("Other expenses").amounts).toEqual([15000, 10000]);
    expect(line("Purchases of stock-in-trade").amounts).toEqual([0, 40000]);
    expect(pnl.totalExpenses).toEqual([75000, 50000]);
    expect(pnl.profitBeforeTax).toEqual([136500, 50000]);
  });

  it("expands headings to accounts", () => {
    expect(line("Other income").accounts.map((a) => [a.code, a.amounts[0]])).toEqual([["4210", 1500], ["4220", 10000]]);
  });

  it("is not affected by the year-end close when it is excluded", () => {
    const fy = buildProfitAndLoss(accounts, [totals(between("2025-04-01", "2026-03-31", true))]);
    expect(fy.profitBeforeTax).toEqual([50000]);
    const withClose = buildProfitAndLoss(accounts, [totals(between("2025-04-01", "2026-03-31"))]);
    expect(withClose.profitBeforeTax).toEqual([0]);
  });

  it("supports monthly columns that add up to the period", () => {
    const months = ["04", "05", "06", "07", "08", "09", "10", "11"].map((m) => totals(between(`2026-${m}-01`, `2026-${m}-31`, true)));
    const monthly = buildProfitAndLoss(accounts, months);
    expect(monthly.profitBeforeTax.reduce((s, v) => s + v, 0)).toBe(136500);
  });
});

describe("balance sheet", () => {
  const asOn = "2026-11-05";
  const bs = buildBalanceSheet(accounts, [totals(upTo(asOn)), totals(upTo("2026-03-31"))]);
  const line = (key: string) => bs.lines.find((l) => l.key === key)!;

  it("balances once the current year's profit is included", () => {
    expect(bs.currentProfit).toEqual([136500, 0]);
    expect(bs.difference).toEqual([0, 0]);
    expect(bs.totalAssets).toEqual(bs.totalEquityLiabilities);
  });

  it("would not balance without the unclosed profit", () => {
    const without = bs.totalEquityLiabilities[0] - bs.currentProfit[0];
    expect(bs.totalAssets[0] - without).toBe(136500);
  });

  it("shows property, plant & equipment net of accumulated depreciation", () => {
    // Plant 300000 − 100000, vehicles −20000, computers 80000, accumulated −12000 + 45000.
    expect(line("Property, plant & equipment").amounts[0]).toBe(200000 - 20000 + 80000 + 33000);
  });

  it("puts reserves & surplus including the current profit under shareholders' funds", () => {
    expect(line("Share capital").amounts).toEqual([600000, 600000]);
    expect(line("Reserves & surplus").amounts).toEqual([200000 + 50000 + 136500, 250000]);
    expect(line("Reserves & surplus").accounts.at(-1)?.id).toBe("current-profit");
  });

  it("classifies current liabilities and assets", () => {
    expect(line("Long-term borrowings").amounts[0]).toBe(250000);
    expect(line("Trade payables").amounts[0]).toBe(70800);
    expect(line("Other current liabilities").amounts[0]).toBe(18000 + 18000 + 18000 + 12000);
    expect(line("Trade receivables").amounts[0]).toBe(86000);
    expect(line("Short-term loans & advances").amounts[0]).toBe(25000);
    expect(line("Inventories").amounts[0]).toBe(60000);
  });

  it("agrees for a single-column sheet before any profit", () => {
    const opening = buildBalanceSheet(accounts, [totals(upTo("2025-04-01"))]);
    expect(opening.totalAssets).toEqual([800000]);
    expect(opening.difference).toEqual([0]);
  });
});

describe("cash flow", () => {
  const from = "2026-04-01";
  const to = "2026-11-05";
  const cf = buildCashFlow(accounts, totals(before(from)), totals(between(from, to, true)));

  it("reconciles the net change to the movement in cash", () => {
    expect(cf.openingCash).toBe(608000);
    expect(cf.difference).toBe(0);
    expect(cf.netChange).toBe(cf.cashMovement);
    expect(cf.closingCash).toBe(cf.openingCash + cf.netChange);
  });

  it("starts from profit before tax and adds back non-cash items", () => {
    expect(cf.profitBeforeTax).toBe(136500);
    const labels = cf.operating.map((l) => [l.label, l.amount]);
    expect(labels).toContainEqual(["Add: Depreciation", 12000]);
    expect(labels).toContainEqual(["Add: Loss on sale of assets", 3000]);
    expect(labels).toContainEqual(["Less: Profit on sale of assets", -10000]);
    expect(labels).toContainEqual(["Add: Interest expense", 3000]);
  });

  it("shows working capital changes with the right signs", () => {
    const wc = Object.fromEntries(cf.operating.map((l) => [l.label, l.amount]));
    expect(wc["(Increase) / decrease in trade receivables"]).toBe(-86000);
    expect(wc["(Increase) / decrease in inventories"]).toBe(-60000);
    expect(wc["Increase / (decrease) in trade payables"]).toBe(70800 - 47200);
    expect(wc["(Increase) / decrease in short-term loans & advances"]).toBe(-25000);
  });

  it("puts asset purchases and sale proceeds in investing", () => {
    expect(cf.netInvesting).toBe(-80000 + 70000 + 12000);
    expect(cf.investing.find((l) => l.label.startsWith("Purchase of"))?.amount).toBe(-80000);
  });

  it("puts borrowings and interest paid in financing", () => {
    expect(cf.netFinancing).toBe(250000 - 3000);
  });

  it("is unaffected by a cash-to-bank transfer and reconciles for every month", () => {
    for (const m of ["04", "05", "06", "07", "08", "09", "10"]) {
      const s = `2026-${m}-01`;
      const monthly = buildCashFlow(accounts, totals(before(s)), totals(between(s, `2026-${m}-31`, true)));
      expect(monthly.difference, m).toBe(0);
    }
  });

  it("reconciles a period that includes opening balances and the year-end close", () => {
    const all = buildCashFlow(accounts, new Map(), totals(between("2025-01-01", "2026-11-05", true)));
    expect(all.difference).toBe(0);
    expect(all.closingCash).toBe(cf.closingCash);
  });
});

describe("helpers", () => {
  it("adds totals and shifts a range back a year", () => {
    const a = new Map([["x", { debit: 1, credit: 2 }]]);
    expect(addTotals(a, { x: { debit: 3, credit: 0.5 }, y: { debit: 1, credit: 0 } }).get("x")).toEqual({ debit: 4, credit: 2.5 });
    expect(previousYearRange("2024-04-01", "2024-02-29".replace("2024", "2028"))).toEqual({ from: "2023-04-01", to: "2027-02-28" });
  });
});
