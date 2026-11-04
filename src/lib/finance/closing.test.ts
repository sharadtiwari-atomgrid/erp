import { describe, expect, it } from "vitest";
import { assertBalanced } from "./chart";
import { closingLines } from "./closing";

describe("year-end closing lines", () => {
  it("zeroes income and expenses and credits the profit to retained earnings", () => {
    const { lines, profit } = closingLines([
      { accountId: "sales", type: "INCOME", debit: 100, credit: 10_100 },
      { accountId: "rent", type: "EXPENSE", debit: 3000, credit: 0 },
      { accountId: "wages", type: "EXPENSE", debit: 2500.5, credit: 500 },
      { accountId: "bank", type: "ASSET", debit: 99_999, credit: 0 },
      { accountId: "idle", type: "EXPENSE", debit: 40, credit: 40 },
    ]);
    expect(profit).toBe(5000 - 0.5 + 0); // 10,000 − 3,000 − 2,000.50
    expect(lines.map((l) => [typeof l.account === "string" ? l.account : l.account.id, l.debit, l.credit])).toEqual([
      ["sales", 10_000, 0],
      ["rent", 0, 3000],
      ["wages", 0, 2000.5],
      ["RETAINED_EARNINGS", 0, 4999.5],
    ]);
    expect(() => assertBalanced(lines)).not.toThrow();
  });

  it("debits a loss to retained earnings", () => {
    const { lines, profit } = closingLines([
      { accountId: "sales", type: "INCOME", debit: 0, credit: 1000 },
      { accountId: "rent", type: "EXPENSE", debit: 1500, credit: 0 },
    ]);
    expect(profit).toBe(-500);
    expect(lines.at(-1)).toMatchObject({ account: "RETAINED_EARNINGS", debit: 500, credit: 0 });
    expect(() => assertBalanced(lines)).not.toThrow();
  });

  it("needs no retained earnings line at break-even, and nothing when all balances are zero", () => {
    const even = closingLines([
      { accountId: "sales", type: "INCOME", debit: 0, credit: 700 },
      { accountId: "rent", type: "EXPENSE", debit: 700, credit: 0 },
    ]);
    expect(even.profit).toBe(0);
    expect(even.lines).toHaveLength(2);
    expect(closingLines([{ accountId: "x", type: "INCOME", debit: 5, credit: 5 }])).toEqual({ lines: [], profit: 0 });
  });
});
