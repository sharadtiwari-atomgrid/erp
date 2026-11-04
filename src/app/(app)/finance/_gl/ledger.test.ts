import { describe, expect, it } from "vitest";
import {
  OPENING_DIFFERENCE_TEXT,
  budgetVsActual,
  buildAccountTree,
  convert,
  filterTree,
  fiscalMonths,
  journalTotals,
  monthsInView,
  netOf,
  sourceHref,
  typeTotals,
  uplift,
  validateJournalLines,
  withOpeningBalanceLine,
  withRunningBalance,
  type TreeAccount,
} from "./ledger";

describe("journal balance and validation", () => {
  it("totals debits and credits to the paisa", () => {
    expect(journalTotals([{ debit: 100.105, credit: 0 }, { debit: 0, credit: 100.11 }])).toEqual({ debit: 100.11, credit: 100.11, difference: 0, balanced: true });
    expect(journalTotals([{ debit: 50, credit: 0 }, { debit: 0, credit: 20 }]).difference).toBe(30);
    expect(journalTotals([]).balanced).toBe(false);
  });

  it("drops blank lines and rejects incomplete ones", () => {
    const ok = validateJournalLines([
      { accountId: "a", debit: 10, credit: 0 },
      { accountId: "", debit: 0, credit: 0 },
      { accountId: "b", debit: 0, credit: 10 },
    ]);
    expect(ok.ok && ok.lines.length).toBe(2);
    expect(validateJournalLines([{ accountId: "", debit: 5, credit: 0 }])).toEqual({ ok: false, error: "Line 1: choose an account." });
    expect(validateJournalLines([{ accountId: "a", debit: 5, credit: 5 }]).ok).toBe(false);
    expect(validateJournalLines([{ accountId: "a", debit: -5, credit: 0 }]).ok).toBe(false);
    expect(validateJournalLines([{ accountId: "a", debit: 0, credit: 0 }]).ok).toBe(false);
    expect(validateJournalLines([]).ok).toBe(false);
  });

  it("allows an unbalanced draft but not an unbalanced posting", () => {
    const lines = [
      { accountId: "a", debit: 10, credit: 0 },
      { accountId: "b", debit: 0, credit: 7 },
    ];
    expect(validateJournalLines(lines).ok).toBe(true);
    const posted = validateJournalLines(lines, { forPosting: true });
    expect(posted.ok).toBe(false);
    expect(!posted.ok && posted.error).toContain("difference 3.00");
    expect(validateJournalLines([{ accountId: "a", debit: 10, credit: 0 }], { forPosting: true }).ok).toBe(false);
  });

  it("balances opening balance journals to the opening balance account", () => {
    const lines = withOpeningBalanceLine(
      [
        { accountId: "bank", debit: 5000, credit: 0 },
        { accountId: "loan", debit: 0, credit: 2000 },
      ],
      "obe",
    );
    expect(lines).toHaveLength(3);
    expect(lines[2]).toMatchObject({ accountId: "obe", debit: 0, credit: 3000, description: OPENING_DIFFERENCE_TEXT });
    expect(journalTotals(lines).balanced).toBe(true);
    // Recomputed, not stacked, after an edit.
    const again = withOpeningBalanceLine([...lines.slice(0, 2).map((l) => ({ ...l })), lines[2]].map((l, i) => (i === 1 ? { ...l, credit: 6000 } : l)), "obe");
    expect(again).toHaveLength(3);
    expect(again[2]).toMatchObject({ debit: 1000, credit: 0 });
    // A manual line on the opening account is kept.
    const manual = withOpeningBalanceLine([{ accountId: "obe", debit: 100, credit: 0, description: "Manual" }, { accountId: "bank", debit: 0, credit: 100 }], "obe");
    expect(manual).toHaveLength(2);
  });
});

describe("running balance", () => {
  const entries = [
    { debit: 1000, credit: 0 },
    { debit: 0, credit: 250.5 },
    { debit: 0, credit: 1000 },
  ];
  it("runs in the debit direction for assets and expenses", () => {
    expect(withRunningBalance(entries, "ASSET", 100).map((e) => e.balance)).toEqual([1100, 849.5, -150.5]);
    expect(withRunningBalance(entries, "EXPENSE").map((e) => e.balance)).toEqual([1000, 749.5, -250.5]);
  });
  it("runs in the credit direction for liabilities, equity and income", () => {
    expect(withRunningBalance(entries, "INCOME").map((e) => e.balance)).toEqual([-1000, -749.5, 250.5]);
    expect(withRunningBalance(entries, "LIABILITY", 500).map((e) => e.balance)).toEqual([-500, -249.5, 750.5]);
  });
});

describe("chart of accounts tree", () => {
  const acc = (id: string, code: string, type: TreeAccount["type"], parentId: string | null, isGroup = false): TreeAccount => ({ id, code, name: `Account ${code}`, type, parentId, isGroup });
  const accounts = [
    acc("inc", "4000", "INCOME", null, true),
    acc("sales", "4100", "INCOME", "inc"),
    acc("cur", "1400", "ASSET", null, true),
    acc("banks", "1440", "ASSET", "cur", true),
    acc("bank2", "1442", "ASSET", "banks"),
    acc("bank1", "1441", "ASSET", "banks"),
    acc("cash", "1430", "ASSET", "cur"),
    acc("orphan", "1999", "ASSET", "missing"),
  ];
  const totals = new Map([
    ["bank1", { debit: 1000, credit: 200 }],
    ["bank2", { debit: 50, credit: 0 }],
    ["cash", { debit: 10, credit: 0 }],
    ["sales", { debit: 100, credit: 900 }],
  ]);
  const rows = buildAccountTree(accounts, totals);

  it("orders by type, then code, with children under headings", () => {
    expect(rows.map((r) => `${r.depth}:${r.code}`)).toEqual(["0:1400", "1:1430", "1:1440", "2:1441", "2:1442", "0:1999", "0:4000", "1:4100"]);
  });
  it("rolls balances up into headings in the normal direction", () => {
    const by = new Map(rows.map((r) => [r.id, r]));
    expect(by.get("banks")!.balance).toBe(850);
    expect(by.get("cur")!.balance).toBe(860);
    expect(by.get("inc")!.balance).toBe(800);
    expect(typeTotals(rows)).toMatchObject({ ASSET: 860, INCOME: 800, LIABILITY: 0 });
  });
  it("keeps headings above search matches", () => {
    expect(filterTree(rows, (r) => r.code === "1442").map((r) => r.code)).toEqual(["1400", "1440", "1442"]);
  });
});

describe("source links", () => {
  it("maps source types to pages", () => {
    expect(sourceHref("Invoice", "i1")).toBe("/sales/invoices/i1");
    expect(sourceHref("Journal", "j1")).toBe("/finance/journals/j1");
    expect(sourceHref("CashReceipt", "r1")).toBe("/finance/receipts/r1");
    expect(sourceHref("PurchaseInvoice", "p1")).toBe("/finance/purchase-invoices/p1");
    expect(sourceHref("VendorPayment", "v1")).toBe("/finance/vendor-payments/v1");
    expect(sourceHref("DepreciationRun", "d1")).toBe("/finance/depreciation/d1");
    expect(sourceHref("FixedAsset", "f1")).toBe("/finance/fixed-assets/f1");
    expect(sourceHref("Payment", "pay1", new Map([["pay1", "inv9"]]))).toBe("/sales/invoices/inv9");
    expect(sourceHref("Payment", "pay1")).toBeNull();
    expect(sourceHref(null, "x")).toBeNull();
    expect(sourceHref("Unknown", "x")).toBeNull();
  });
});

describe("budget vs actual", () => {
  it("lists the twelve April–March months", () => {
    const m = fiscalMonths(2026);
    expect(m[0]).toBe("2026-04-01");
    expect(m[11]).toBe("2027-03-01");
    expect(monthsInView(m, "2026-06-01", "ytd")).toEqual(["2026-04-01", "2026-05-01", "2026-06-01"]);
    expect(monthsInView(m, "2026-06-01", "month")).toEqual(["2026-06-01"]);
    expect(monthsInView(m, "2025-06-01", "ytd")).toEqual([]);
  });

  it("computes actuals, variance and % in each account's direction", () => {
    const [income, expense, noBudget] = budgetVsActual([
      { accountId: "sales", type: "INCOME", budget: 1000, debit: 50, credit: 1250 },
      { accountId: "rent", type: "EXPENSE", budget: 400, debit: 500, credit: 0 },
      { accountId: "misc", type: "EXPENSE", budget: 0, debit: 30, credit: 0 },
    ]);
    expect(income).toMatchObject({ actual: 1200, variance: 200, variancePct: 20, favourable: true });
    expect(expense).toMatchObject({ actual: 500, variance: 100, variancePct: 25, favourable: false });
    expect(noBudget).toMatchObject({ actual: 30, variance: 30, variancePct: null, favourable: false });
    expect(netOf([income, expense, noBudget])).toEqual({ budget: 600, actual: 670, variance: 70 });
  });

  it("applies an uplift to last year's actuals", () => {
    expect(uplift(1000, 10)).toBe(1100);
    expect(uplift(999.4, 0)).toBe(999);
    expect(uplift(200, -5)).toBe(190);
  });
});

describe("currency converter", () => {
  it("converts through rupees", () => {
    expect(convert(100, 83.5, 1)).toBe(8350);
    expect(convert(8350, 1, 83.5)).toBe(100);
    expect(convert(10, 90, 0)).toBe(0);
  });
});
