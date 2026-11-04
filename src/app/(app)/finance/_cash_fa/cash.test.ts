import { describe, expect, it } from "vitest";
import { buildForecast, monthBuckets, weekBuckets, type ForecastItem } from "./forecast";
import { autoMatch, manualMatchProblem, reconciliationSummary, referenceSimilarity, type MatchEntry, type MatchLine } from "./matching";
import { detectColumns, dropDuplicates, duplicateKey, findHeaderRow, mappingProblem, NO_COLUMN, parseAmount, parseStatement, type Cell } from "./statement";

describe("statement import", () => {
  it("detects HDFC-style columns", () => {
    const m = detectColumns(["Date", "Narration", "Chq./Ref.No.", "Value Dt", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"]);
    expect(m).toMatchObject({ date: 0, description: 1, reference: 2, withdrawal: 4, deposit: 5, balance: 6, amount: NO_COLUMN });
  });

  it("prefers the transaction date over the value date (ICICI-style)", () => {
    const m = detectColumns(["S No.", "Value Date", "Transaction Date", "Cheque Number", "Transaction Remarks", "Withdrawal Amount (INR )", "Deposit Amount (INR )", "Balance (INR )"]);
    expect(m).toMatchObject({ date: 2, reference: 3, description: 4, withdrawal: 5, deposit: 6, balance: 7 });
  });

  it("detects Axis-style short headers and a signed amount with Dr/Cr", () => {
    expect(detectColumns(["Tran Date", "CHQNO", "PARTICULARS", "DR", "CR", "BAL"])).toMatchObject({ date: 0, reference: 1, description: 2, withdrawal: 3, deposit: 4, balance: 5 });
    expect(detectColumns(["Date", "Description", "Amount", "Dr/Cr", "Balance"])).toMatchObject({ date: 0, description: 1, amount: 2, drCr: 3, balance: 4 });
  });

  it("finds the header below a preamble", () => {
    const rows: Cell[][] = [["Statement of account"], ["Account No: XXXX1234"], [], ["Txn Date", "Description", "Debit", "Credit", "Balance"], ["01/04/2026", "Opening", "", "", "1000"]];
    expect(findHeaderRow(rows)).toBe(3);
  });

  it("parses Indian amount formats", () => {
    expect(parseAmount("1,23,456.50")).toBe(123456.5);
    expect(parseAmount("(1,000.00)")).toBe(-1000);
    expect(parseAmount("500.00 Dr")).toBe(-500);
    expect(parseAmount("500.00 Cr")).toBe(500);
    expect(parseAmount("₹ 2,000")).toBe(2000);
    expect(parseAmount("-75")).toBe(-75);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("-")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount(12.5)).toBe(12.5);
  });

  it("parses rows with dd/mm/yyyy dates and separate withdrawal/deposit columns", () => {
    const rows: Cell[][] = [
      ["Date", "Narration", "Ref No", "Withdrawal", "Deposit", "Balance"],
      ["05/11/2026", "NEFT-ACME TRADERS-INV-00012", "N123", "", "11,800.00", "61,800.00"],
      ["06/11/2026", "CHQ PAID 000045", "000045", "2,500.00", "", "59,300.00"],
      ["", "Total", "", "2,500.00", "11,800.00", ""],
      ["07/11/2026", "Nothing", "", "", "", ""],
    ];
    const r = parseStatement(rows, 0, detectColumns(rows[0]));
    expect(r.lines).toEqual([
      { date: "2026-11-05", description: "NEFT-ACME TRADERS-INV-00012", reference: "N123", amount: 11800, balance: 61800, row: 2 },
      { date: "2026-11-06", description: "CHQ PAID 000045", reference: "000045", amount: -2500, balance: 59300, row: 3 },
    ]);
    expect(r.skipped).toEqual([{ row: 4, reason: "No valid date" }, { row: 5, reason: "No amount" }]);
  });

  it("applies a Dr/Cr indicator to a single amount column", () => {
    const rows: Cell[][] = [["Date", "Description", "Amount", "Dr/Cr"], ["01/12/2026", "Charges", "118", "DR"], ["02/12/2026", "Interest", "45.5", "CR"]];
    const r = parseStatement(rows, 0, detectColumns(rows[0]));
    expect(r.lines.map((l) => l.amount)).toEqual([-118, 45.5]);
  });

  it("validates the mapping", () => {
    expect(mappingProblem(detectColumns(["Narration", "Amount"]))).toMatch(/date/);
    expect(mappingProblem(detectColumns(["Date", "Narration"]))).toMatch(/withdrawal/);
    expect(mappingProblem(detectColumns(["Date", "Amount"]))).toBeNull();
  });

  it("skips duplicates by date + amount + reference", () => {
    const a = { date: "2026-11-05", amount: 100, reference: "UTR-1" };
    const existing = [duplicateKey({ date: "2026-11-05", amount: 100.0, reference: "utr1" })];
    const r = dropDuplicates([a, { ...a, reference: "UTR-2" }, { ...a, reference: "UTR-2" }, { ...a, amount: 101 }], existing);
    expect(r.duplicates).toBe(2);
    expect(r.fresh.map((l) => `${l.reference}:${l.amount}`)).toEqual(["UTR-2:100", "UTR-1:101"]);
  });
});

describe("auto-match", () => {
  const line = (id: string, date: string, amount: number, reference: string | null = null, description = ""): MatchLine => ({ id, date, amount, reference, description });
  const entry = (id: string, date: string, debit: number, credit: number, documentNo: string | null = null, description: string | null = null): MatchEntry => ({ id, date, debit, credit, documentNo, description });

  it("matches deposits to debits and withdrawals to credits by exact amount", () => {
    const m = autoMatch([line("L1", "2026-11-05", 1180), line("L2", "2026-11-06", -500)], [entry("E1", "2026-11-05", 0, 1180), entry("E2", "2026-11-05", 1180, 0), entry("E3", "2026-11-06", 0, 500)]);
    expect(m.map((x) => [x.lineId, x.entryId])).toEqual(expect.arrayContaining([["L1", "E2"], ["L2", "E3"]]));
    expect(m).toHaveLength(2);
  });

  it("respects the ±3 day window", () => {
    expect(autoMatch([line("L1", "2026-11-10", 100)], [entry("E1", "2026-11-07", 100, 0)])).toHaveLength(1);
    expect(autoMatch([line("L1", "2026-11-10", 100)], [entry("E1", "2026-11-06", 100, 0)])).toHaveLength(0);
    expect(autoMatch([line("L1", "2026-11-10", 100)], [entry("E1", "2026-11-14", 100, 0)])).toHaveLength(0);
  });

  it("uses reference similarity to choose between equal amounts", () => {
    const m = autoMatch(
      [line("L1", "2026-11-05", 5000, "UTR998", "NEFT INV-00031 ZEBRA FOODS")],
      [entry("E1", "2026-11-05", 5000, 0, "INV-00030", "Payment from Yak Mills"), entry("E2", "2026-11-07", 5000, 0, "INV-00031", "Payment from Zebra Foods")],
    );
    expect(m).toEqual([expect.objectContaining({ lineId: "L1", entryId: "E2" })]);
  });

  it("prefers the closer date when references say nothing", () => {
    const m = autoMatch([line("L1", "2026-11-05", 300)], [entry("E1", "2026-11-03", 300, 0), entry("E2", "2026-11-05", 300, 0)]);
    expect(m[0].entryId).toBe("E2");
  });

  it("uses each line and entry once", () => {
    const m = autoMatch([line("L1", "2026-11-05", 300), line("L2", "2026-11-05", 300)], [entry("E1", "2026-11-05", 300, 0)]);
    expect(m).toHaveLength(1);
  });

  it("scores reference similarity", () => {
    expect(referenceSimilarity({ reference: null, description: "CHQ 000045 VPAY-00012" }, { documentNo: "VPAY-00012", description: null })).toBe(1);
    expect(referenceSimilarity({ reference: "000045", description: "" }, { documentNo: "X", description: "Cheque 000045 to Oak Ltd" })).toBe(1);
    expect(referenceSimilarity({ reference: null, description: "Interest" }, { documentNo: "JV-1", description: "Rent" })).toBe(0);
  });

  it("checks manual matches add up", () => {
    expect(manualMatchProblem({ amount: -1500 }, [{ debit: 0, credit: 1000 }, { debit: 0, credit: 500 }])).toBeNull();
    expect(manualMatchProblem({ amount: -1500 }, [{ debit: 0, credit: 1000 }])).toMatch(/total -1000.00/);
    expect(manualMatchProblem({ amount: 10 }, [])).toMatch(/at least one/);
  });

  it("summarises a reconciliation", () => {
    // Books 10,000; a 2,000 deposit not yet credited by the bank; a 500 cheque not yet presented.
    const s = reconciliationSummary({ bookBalance: 10000, uncleared: [{ debit: 2000, credit: 0 }, { debit: 0, credit: 500 }], statementBalance: 8500 });
    expect(s).toMatchObject({ unclearedDeposits: 2000, unclearedPayments: 500, expectedStatementBalance: 8500, difference: 0 });
    expect(reconciliationSummary({ bookBalance: 100, uncleared: [], statementBalance: 90 }).difference).toBe(-10);
  });
});

describe("cash flow forecast", () => {
  const today = "2026-11-05";

  it("builds 12 weekly buckets from today", () => {
    const b = weekBuckets(today);
    expect(b).toHaveLength(12);
    expect(b[0]).toMatchObject({ start: "2026-11-05", end: "2026-11-11" });
    expect(b[11].end).toBe("2027-01-27");
  });

  it("builds month buckets starting today", () => {
    const b = monthBuckets(today, 3);
    expect(b.map((x) => [x.start, x.end])).toEqual([["2026-11-05", "2026-11-30"], ["2026-12-01", "2026-12-31"], ["2027-01-01", "2027-01-31"]]);
    expect(monthBuckets("2026-12-20", 2)[1].label).toBe("Jan 2027");
  });

  it("puts overdue items in week 1, buckets by date, and runs the balance", () => {
    const items: ForecastItem[] = [
      { date: "2026-10-01", amount: 1000, source: "receivables" }, // overdue → week 1
      { date: "2026-11-12", amount: 500, source: "salesOrders" }, // week 2
      { date: "2026-11-11", amount: 3000, source: "payables" }, // week 1 (last day)
      { date: "2026-11-20", amount: 400, source: "purchaseOrders" }, // week 3
      { date: "2027-06-01", amount: 9999, source: "receivables" }, // later
      { date: "2027-06-01", amount: 111, source: "payables" }, // later
    ];
    const { rows, laterIn, laterOut } = buildForecast(1500, items, weekBuckets(today));
    expect(rows[0]).toMatchObject({ opening: 1500, receivables: 1000, payables: 3000, net: -2000, closing: -500, negative: true });
    expect(rows[1]).toMatchObject({ salesOrders: 500, closing: 0, negative: false });
    expect(rows[2]).toMatchObject({ purchaseOrders: 400, closing: -400, negative: true });
    expect(rows[11].closing).toBe(-400);
    expect(laterIn).toBe(9999);
    expect(laterOut).toBe(111);
  });
});
