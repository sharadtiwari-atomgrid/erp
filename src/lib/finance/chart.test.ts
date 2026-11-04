import { describe, expect, it } from "vitest";
import { DEFAULT_ACCOUNTS, POSTING_KEYS, assertBalanced, fiscalYearOf, normalBalance, periodsOf, tdsQuarterOf } from "./chart";

describe("chart of accounts", () => {
  it("has unique codes and every parent and posting account exists", () => {
    const codes = DEFAULT_ACCOUNTS.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const a of DEFAULT_ACCOUNTS) if (a.parent) expect(codes).toContain(a.parent);
    for (const { code } of Object.values(POSTING_KEYS)) {
      const account = DEFAULT_ACCOUNTS.find((a) => a.code === code);
      expect(account, code).toBeDefined();
      expect(account?.isGroup, code).toBeFalsy();
    }
  });
});

describe("assertBalanced", () => {
  it("accepts balanced postings to the paisa", () => {
    expect(assertBalanced([{ debit: 118 }, { credit: 100 }, { credit: 9 }, { credit: 9 }])).toEqual({ debit: 118, credit: 118 });
    expect(() => assertBalanced([{ debit: 0.1 }, { debit: 0.2 }, { credit: 0.3 }])).not.toThrow();
  });
  it("rejects unbalanced, negative, two-sided or empty postings", () => {
    expect(() => assertBalanced([{ debit: 100 }, { credit: 99.99 }])).toThrow(/not balanced/);
    expect(() => assertBalanced([{ debit: -5 }, { credit: -5 }])).toThrow(/negative/);
    expect(() => assertBalanced([{ debit: 5, credit: 5 }, { debit: 0 }])).toThrow(/both/);
    expect(() => assertBalanced([{ debit: 0 }, { credit: 0 }])).toThrow(/no amounts/);
    expect(() => assertBalanced([{ debit: 5 }])).toThrow(/two lines/);
  });
});

describe("dates", () => {
  it("uses April–March financial years", () => {
    expect(fiscalYearOf("2026-11-05")).toMatchObject({ name: "FY 2026-27", start: "2026-04-01", end: "2027-03-31" });
    expect(fiscalYearOf("2027-03-31").name).toBe("FY 2026-27");
    expect(fiscalYearOf("2027-04-01").name).toBe("FY 2027-28");
  });
  it("splits a year into 12 calendar months", () => {
    const p = periodsOf(2026);
    expect(p).toHaveLength(12);
    expect(p[0]).toEqual({ name: "Apr 2026", start: "2026-04-01", end: "2026-04-30" });
    expect(p[10]).toEqual({ name: "Feb 2027", start: "2027-02-01", end: "2027-02-28" });
    expect(p[11].end).toBe("2027-03-31");
  });
  it("labels TDS quarters", () => {
    expect(tdsQuarterOf("2026-05-10")).toBe("Q1 FY 2026-27");
    expect(tdsQuarterOf("2026-11-05")).toBe("Q3 FY 2026-27");
    expect(tdsQuarterOf("2027-02-01")).toBe("Q4 FY 2026-27");
  });
});

describe("normalBalance", () => {
  it("is debit-positive for assets and expenses, credit-positive otherwise", () => {
    expect(normalBalance("ASSET", 100, 30)).toBe(70);
    expect(normalBalance("EXPENSE", 10, 0)).toBe(10);
    expect(normalBalance("INCOME", 0, 50)).toBe(50);
    expect(normalBalance("LIABILITY", 20, 50)).toBe(30);
  });
});
