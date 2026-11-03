import { describe, expect, test } from "vitest";
import { allComplete, blankEntry, canMoveToMis, computeTotal, deriveStage, earlierStage, missingFor, missingUpTo, requiredFields } from "./logic";
import { parsePaste } from "./paste";
import { daysInFreshPo, isLongHoldDue, slaBadge } from "./sla";
import { boardCsv, csvFileName } from "./csv";

function filled(phases: Array<"demand" | "supply" | "logistics">) {
  const e: Record<string, string> = blankEntry();
  for (const p of phases) for (const f of requiredFields(p)) e[f.key] = "x";
  return e;
}

describe("stage derivation", () => {
  test("follows which phases are complete", () => {
    expect(deriveStage(blankEntry())).toBe("DEMAND_PENDING");
    expect(deriveStage(filled(["demand"]))).toBe("SUPPLY_PENDING");
    expect(deriveStage(filled(["demand", "supply"]))).toBe("LOGISTICS_PENDING");
    expect(deriveStage(filled(["demand", "supply", "logistics"]))).toBe("READY");
    // A later phase alone does not count.
    expect(deriveStage(filled(["supply", "logistics"]))).toBe("DEMAND_PENDING");
  });

  test("auto fields are never reported missing", () => {
    const miss = missingFor("demand", blankEntry());
    expect(miss).toContain("customer");
    expect(miss).not.toContain("productType");
    expect(miss).not.toContain("totalTaxable");
    expect(miss).not.toContain("requestNo");
    expect(miss).not.toContain("cxLogisticsPoc");
    // Defaults count as filled.
    expect(miss).not.toContain("businessLeg");
    expect(missingFor("logistics", blankEntry())).toEqual(["verifiedBy"]);
  });

  test("an advance checks its phase and every earlier one", () => {
    const e = filled(["demand"]);
    expect(missingUpTo("demand", e)).toEqual([]);
    expect(missingUpTo("logistics", e)).toEqual([...missingFor("supply", e), "verifiedBy"]);
  });

  test("moving to Domestic MIS needs READY and every phase complete", () => {
    const all = filled(["demand", "supply", "logistics"]);
    expect(allComplete(all)).toBe(true);
    expect(canMoveToMis("READY", all)).toBe(true);
    expect(canMoveToMis("LOGISTICS_PENDING", all)).toBe(false);
    expect(canMoveToMis("READY", { ...all, hsnCode: "" })).toBe(false);
  });

  test("earlierStage", () => {
    expect(earlierStage("READY", "SUPPLY_PENDING")).toBe("SUPPLY_PENDING");
    expect(earlierStage("DEMAND_PENDING", "READY")).toBe("DEMAND_PENDING");
  });
});

test("Total Taxable = qty to dispatch × rate, rounded to 0.1", () => {
  expect(computeTotal("1000", "4425")).toBe("4425000");
  expect(computeTotal("50", "938.13")).toBe("46906.5");
  expect(computeTotal("1,250", "10.04")).toBe("12550");
  expect(computeTotal("", "10")).toBe("");
});

describe("paste from email", () => {
  test("tab and colon lines, with continuation lines", () => {
    const out = parsePaste(
      [
        "Job No.\t459",
        "Customer\tExample Agro Pvt Ltd",
        "Rate (Rs/Kg)\t4425",
        "SCM Team to Contact Customer: No",
        "Delivery Address\tPlot 1, Demo Industrial Area",
        "Sample City 123456",
        "HS Code: 38089390",
        "Unknown label\tignored",
      ].join("\n"),
    );
    expect(out).toEqual({
      requestNo: "459",
      customer: "Example Agro Pvt Ltd",
      rate: "4425",
      scmContactCustomer: "No",
      deliveryAddress: "Plot 1, Demo Industrial Area · Sample City 123456",
      hsnCode: "38089390",
    });
  });
});

describe("long-hold SLA", () => {
  const today = "2026-11-02";
  test("counts from the PO date", () => {
    expect(daysInFreshPo({ poDate: "2026-10-18" }, today)).toBe(15);
    expect(isLongHoldDue({ poDate: "2026-10-18" }, today)).toBe(false);
    expect(isLongHoldDue({ poDate: "2026-10-17" }, today)).toBe(true);
    expect(isLongHoldDue({ poDate: new Date("2026-10-17T00:00:00Z") }, today)).toBe(true);
  });
  test("restarts when brought back from Long Hold", () => {
    expect(daysInFreshPo({ poDate: "2026-09-01", holdReleasedAt: "2026-10-30" }, today)).toBe(3);
    // An older release date doesn't override a later PO date.
    expect(daysInFreshPo({ poDate: "2026-10-30", holdReleasedAt: "2026-09-01" }, today)).toBe(3);
  });
  test("falls back to the created day (IST)", () => {
    expect(daysInFreshPo({ createdAt: "2026-10-01T20:00:00Z" }, today)).toBe(31); // 2 Oct in IST
    expect(daysInFreshPo({}, today)).toBe(0);
  });
  test("badge in the last three days", () => {
    expect(slaBadge({ poDate: "2026-10-22" }, today)).toBeNull();
    expect(slaBadge({ poDate: "2026-10-21" }, today)).toBe("Day 12/15");
  });
});

test("CSV export", () => {
  const csv = boardCsv([
    { id: "1", requestNo: "7", board: "FRESH", stage: "SUPPLY_PENDING", values: { customer: 'A "Co"', poDate: "2026-09-23" }, holdReleasedAt: "", createdAt: "", misJobNo: null, poFile: null },
  ]);
  const [head, row] = csv.split("\n");
  expect(head.startsWith('"Request No.","Status","Customer"')).toBe(true);
  expect(row.startsWith('"7","Supply details pending","A ""Co""","","23/09/2026"')).toBe(true);
  expect(csvFileName("2026-11-02")).toBe("fresh-po-2026-11-02.csv");
});
