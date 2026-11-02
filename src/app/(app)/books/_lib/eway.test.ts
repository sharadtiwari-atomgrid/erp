import { describe, expect, it } from "vitest";
import {
  canCancelEwb,
  ewayDisplayStatus,
  ewayValidityDays,
  ewayValidUntil,
  isValidEwbNumber,
  normaliseEwbNumber,
  parseIstDateTime,
  toIstDateTimeInput,
} from "./eway";

/** Builds a Date from an IST wall-clock time. */
const ist = (s: string) => new Date(`${s}+05:30`);

describe("ewayValidityDays", () => {
  it("gives 1 day per 200 km or part thereof", () => {
    expect(ewayValidityDays(1)).toBe(1);
    expect(ewayValidityDays(200)).toBe(1);
    expect(ewayValidityDays(201)).toBe(2);
    expect(ewayValidityDays(400)).toBe(2);
    expect(ewayValidityDays(401)).toBe(3);
    expect(ewayValidityDays(1000)).toBe(5);
    expect(ewayValidityDays(1001)).toBe(6);
  });

  it("never returns less than one day", () => {
    expect(ewayValidityDays(0)).toBe(1);
    expect(ewayValidityDays(-5)).toBe(1);
    expect(ewayValidityDays(Number.NaN)).toBe(1);
  });
});

describe("ewayValidUntil", () => {
  it("ends at midnight IST of the day after generation for up to 200 km", () => {
    const until = ewayValidUntil(ist("2026-11-02T10:00:00"), 150);
    expect(until.toISOString()).toBe(ist("2026-11-03T23:59:59.999").toISOString());
  });

  it("adds a day for every further 200 km or part", () => {
    expect(ewayValidUntil(ist("2026-11-02T10:00:00"), 201)).toEqual(ist("2026-11-04T23:59:59.999"));
    expect(ewayValidUntil(ist("2026-11-02T10:00:00"), 600)).toEqual(ist("2026-11-05T23:59:59.999"));
    expect(ewayValidUntil(ist("2026-11-02T10:00:00"), 601)).toEqual(ist("2026-11-06T23:59:59.999"));
  });

  it("uses the IST calendar date, not UTC", () => {
    // 00:30 IST on 3 Nov is still 2 Nov in UTC.
    expect(ewayValidUntil(ist("2026-11-03T00:30:00"), 100)).toEqual(ist("2026-11-04T23:59:59.999"));
    // 23:30 IST on 2 Nov.
    expect(ewayValidUntil(ist("2026-11-02T23:30:00"), 100)).toEqual(ist("2026-11-03T23:59:59.999"));
  });

  it("rolls over month and year ends", () => {
    expect(ewayValidUntil(ist("2026-12-31T12:00:00"), 350)).toEqual(ist("2027-01-02T23:59:59.999"));
  });
});

describe("EWB numbers", () => {
  it("accepts exactly 12 digits, ignoring spaces", () => {
    expect(isValidEwbNumber("123456789012")).toBe(true);
    expect(isValidEwbNumber("1234 5678 9012")).toBe(true);
    expect(normaliseEwbNumber("1234 5678 9012")).toBe("123456789012");
    expect(isValidEwbNumber("12345678901")).toBe(false);
    expect(isValidEwbNumber("1234567890123")).toBe(false);
    expect(isValidEwbNumber("12345678901A")).toBe(false);
  });
});

describe("IST datetime inputs", () => {
  it("round-trips a datetime-local value as IST", () => {
    const d = parseIstDateTime("2026-11-02T09:15");
    expect(d?.toISOString()).toBe("2026-11-02T03:45:00.000Z");
    expect(toIstDateTimeInput(d!)).toBe("2026-11-02T09:15");
    expect(parseIstDateTime("not a date")).toBeNull();
  });
});

describe("status helpers", () => {
  const bill = { status: "ACTIVE", generatedAt: ist("2026-11-02T10:00:00"), validUntil: ist("2026-11-03T23:59:59.999") };

  it("shows ACTIVE bills past validity as EXPIRED", () => {
    expect(ewayDisplayStatus(bill, ist("2026-11-03T23:00:00"))).toBe("ACTIVE");
    expect(ewayDisplayStatus(bill, ist("2026-11-04T00:00:00"))).toBe("EXPIRED");
    expect(ewayDisplayStatus({ ...bill, status: "CANCELLED" }, ist("2026-11-05T00:00:00"))).toBe("CANCELLED");
  });

  it("allows cancellation only within 24 hours of generation", () => {
    expect(canCancelEwb(bill, ist("2026-11-03T09:59:00"))).toBe(true);
    expect(canCancelEwb(bill, ist("2026-11-03T10:00:00"))).toBe(false);
    expect(canCancelEwb({ ...bill, status: "CANCELLED" }, ist("2026-11-02T11:00:00"))).toBe(false);
  });
});
