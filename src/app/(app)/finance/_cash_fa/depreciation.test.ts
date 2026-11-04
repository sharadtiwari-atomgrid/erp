import { describe, expect, it } from "vitest";
import { chargeFrom, daysInclusive, depreciationFor, periodRange, projectSchedule, settingsProblem, type DepreciableAsset } from "./depreciation";

const slm = (over: Partial<DepreciableAsset> = {}): DepreciableAsset => ({
  cost: 120000,
  salvageValue: 0,
  method: "SLM",
  usefulLifeYears: 10,
  accumulatedDepreciation: 0,
  acquisitionDate: "2026-04-01",
  depreciatedTo: null,
  ...over,
});

const wdv = (over: Partial<DepreciableAsset> = {}): DepreciableAsset => ({
  cost: 100000,
  salvageValue: 5000,
  method: "WDV",
  ratePct: 15,
  accumulatedDepreciation: 0,
  acquisitionDate: "2026-04-01",
  depreciatedTo: null,
  ...over,
});

describe("days and start date", () => {
  it("counts days inclusively", () => {
    expect(daysInclusive("2026-04-01", "2026-04-30")).toBe(30);
    expect(daysInclusive("2026-04-01", "2026-04-01")).toBe(1);
    expect(daysInclusive("2026-04-02", "2026-04-01")).toBe(0);
    expect(daysInclusive("2027-04-01", "2028-03-31")).toBe(366); // FY 2027-28 has 29 Feb 2028
  });

  it("starts the day after depreciatedTo, never before acquisition", () => {
    expect(chargeFrom({ acquisitionDate: "2026-06-15", depreciatedTo: null })).toBe("2026-06-15");
    expect(chargeFrom({ acquisitionDate: "2026-06-15", depreciatedTo: "2026-06-30" })).toBe("2026-07-01");
    expect(chargeFrom({ acquisitionDate: "2026-06-15", depreciatedTo: "2026-03-31" })).toBe("2026-06-15");
  });
});

describe("straight line (SLM)", () => {
  it("charges (cost − salvage) ÷ life for a full financial year", () => {
    const r = depreciationFor(slm(), "2027-03-31");
    expect(r.amount).toBe(12000);
    expect(r.days).toBe(365);
    expect(r.closingBookValue).toBe(108000);
  });

  it("is pro rata by days for a month", () => {
    // 30 days of 365 × 12,000
    expect(depreciationFor(slm(), "2026-04-30").amount).toBe(986.3);
  });

  it("takes salvage out of the depreciable base", () => {
    expect(depreciationFor(slm({ salvageValue: 20000 }), "2027-03-31").amount).toBe(10000);
  });

  it("starts from the acquisition date for an asset bought mid-period", () => {
    const r = depreciationFor(slm({ acquisitionDate: "2026-10-01" }), "2027-03-31");
    expect(r.from).toBe("2026-10-01");
    expect(r.days).toBe(182);
    expect(r.amount).toBe(5983.56);
  });

  it("charges nothing when already depreciated past the period end or acquired after it", () => {
    expect(depreciationFor(slm({ depreciatedTo: "2027-03-31" }), "2027-03-31").amount).toBe(0);
    expect(depreciationFor(slm({ acquisitionDate: "2027-05-01" }), "2027-03-31").amount).toBe(0);
  });

  it("continues from depreciatedTo", () => {
    const r = depreciationFor(slm({ depreciatedTo: "2026-09-30", accumulatedDepreciation: 6016.44 }), "2027-03-31");
    expect(r.from).toBe("2026-10-01");
    expect(r.amount).toBe(5983.56);
    expect(r.closingBookValue).toBe(108000);
  });

  it("uses a 366-day year in a leap financial year so a full year is still exact", () => {
    const r = depreciationFor(slm({ acquisitionDate: "2027-04-01" }), "2028-03-31");
    expect(r.amount).toBe(12000);
  });

  it("splits a catch-up span across financial years", () => {
    const r = depreciationFor(slm({ acquisitionDate: "2025-04-01" }), "2027-03-31");
    expect(r.amount).toBe(24000);
  });

  it("never takes book value below salvage", () => {
    const a = slm({ salvageValue: 20000, accumulatedDepreciation: 95000, depreciatedTo: "2035-12-31", acquisitionDate: "2026-04-01" });
    const r = depreciationFor(a, "2037-03-31");
    expect(r.amount).toBe(5000);
    expect(r.closingBookValue).toBe(20000);
    expect(depreciationFor({ ...a, accumulatedDepreciation: 100000 }, "2040-03-31").amount).toBe(0);
  });

  it("projects a schedule that ends exactly at salvage", () => {
    const rows = projectSchedule(slm({ salvageValue: 20000, usefulLifeYears: 5, acquisitionDate: "2026-10-01" }));
    expect(rows[0]).toMatchObject({ year: "FY 2026-27", start: "2026-10-01", depreciation: 9972.6 });
    expect(rows.at(-1)?.closing).toBe(20000);
    expect(rows.reduce((s, r) => s + r.depreciation, 0)).toBeCloseTo(100000, 2);
    expect(rows.length).toBe(6); // half year + 4 full years + remainder
  });
});

describe("written-down value (WDV)", () => {
  it("charges rate % of opening book value for a full year", () => {
    expect(depreciationFor(wdv(), "2027-03-31").amount).toBe(15000);
  });

  it("compounds year on year when a span covers several years", () => {
    // 15,000 in FY26-27, then 15% of 85,000 = 12,750
    expect(depreciationFor(wdv(), "2028-03-31").amount).toBe(27750);
  });

  it("is pro rata by days within a year", () => {
    // 30 days: 100,000 × 15% × 30/365
    expect(depreciationFor(wdv(), "2026-04-30").amount).toBe(1232.88);
  });

  it("uses the current book value for a later period", () => {
    const r = depreciationFor(wdv({ accumulatedDepreciation: 15000, depreciatedTo: "2027-03-31" }), "2028-03-31");
    expect(r.openingBookValue).toBe(85000);
    expect(r.amount).toBe(12750);
  });

  it("stops at salvage", () => {
    const r = depreciationFor(wdv({ accumulatedDepreciation: 94000, depreciatedTo: "2040-03-31" }), "2041-03-31");
    expect(r.amount).toBe(900); // 15% of 6,000 = 900; room to salvage is 1,000
    const last = depreciationFor(wdv({ accumulatedDepreciation: 94500, depreciatedTo: "2040-03-31" }), "2041-03-31");
    expect(last.amount).toBe(500);
    expect(last.closingBookValue).toBe(5000);
  });

  it("projects a declining schedule", () => {
    const rows = projectSchedule(wdv());
    expect(rows[0].depreciation).toBe(15000);
    expect(rows[1].depreciation).toBe(12750);
    for (let i = 1; i < rows.length; i++) expect(rows[i].depreciation).toBeLessThanOrEqual(rows[i - 1].depreciation);
    expect(rows.at(-1)!.closing).toBeGreaterThanOrEqual(5000);
  });
});

describe("settings", () => {
  it("rejects incomplete settings and charges nothing for them", () => {
    expect(settingsProblem(slm({ usefulLifeYears: null }))).toMatch(/useful life/);
    expect(settingsProblem(wdv({ ratePct: 0 }))).toMatch(/rate/);
    expect(settingsProblem(slm({ salvageValue: 130000 }))).toMatch(/Salvage/);
    expect(depreciationFor(slm({ usefulLifeYears: 0 }), "2027-03-31").amount).toBe(0);
    expect(settingsProblem(slm())).toBeNull();
  });
});

describe("periodRange", () => {
  it("gives the month", () => {
    expect(periodRange("month", "2026-02-14")).toEqual({ start: "2026-02-01", end: "2026-02-28", label: "Feb 2026" });
  });
  it("gives the financial-year quarter", () => {
    expect(periodRange("quarter", "2026-05-10")).toMatchObject({ start: "2026-04-01", end: "2026-06-30", label: "Q1 FY 2026-27" });
    expect(periodRange("quarter", "2026-11-05")).toMatchObject({ start: "2026-10-01", end: "2026-12-31", label: "Q3 FY 2026-27" });
    expect(periodRange("quarter", "2027-02-01")).toMatchObject({ start: "2027-01-01", end: "2027-03-31", label: "Q4 FY 2026-27" });
  });
  it("gives the financial year", () => {
    expect(periodRange("year", "2027-01-15")).toEqual({ start: "2026-04-01", end: "2027-03-31", label: "FY 2026-27" });
  });
});
