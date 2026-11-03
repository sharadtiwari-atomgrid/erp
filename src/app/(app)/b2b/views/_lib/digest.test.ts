import { describe, expect, it } from "vitest";
import { buckets, lateBy, shipmentReports, when } from "./digest";
import type { FpoRow, MisRow } from "./rows";

const day = "2026-10-28";
type M = Partial<MisRow> & Pick<MisRow, "id" | "jobNo" | "status">;
const blank = {
  logisticsPoc: null,
  plannedEtd: "",
  plannedEta: "",
  actualEtd: "",
  actualEta: "",
  customer: null,
  productName: null,
  poDate: "",
  supplier: null,
  agDemandPoc: null,
  quantityKgs: null,
  cxQuoteApprovalTime: "",
  sxReadinessTime: "",
  blockersRemarks: null,
};
const m = (r: M) => ({ ...blank, ...r });

// Fictional data only.
const mis = [
  m({ id: "a", jobNo: "1086", status: "PLANNED", logisticsPoc: "Lata", plannedEtd: "2026-10-27", actualEtd: "2026-10-29", customer: "Acme Agro" }),
  m({ id: "b", jobNo: "1088", status: "MATERIAL_READY", logisticsPoc: "Lata", actualEtd: "2026-10-30", customer: "Acme Agro" }),
  m({ id: "c", jobNo: "1093", status: "PLANNED", customer: "Beta Chem" }),
  m({ id: "d", jobNo: "1055", status: "INTRANSIT", logisticsPoc: "Lata", actualEtd: "2026-10-23", actualEta: "2026-10-26", customer: "Gamma Labs" }),
  m({ id: "e", jobNo: "1064", status: "INTRANSIT", logisticsPoc: "Kiran", actualEtd: day, plannedEta: "2026-10-29", customer: "Delta Seeds" }),
  m({ id: "f", jobNo: "1075", status: "DELIVERED", logisticsPoc: "Kiran", actualEtd: "2026-10-24", actualEta: day, customer: "Epsilon Ltd" }),
  m({ id: "g", jobNo: "1001", status: "DELIVERED", actualEta: "2026-10-20", customer: "Old Co" }),
  m({ id: "h", jobNo: "1099", status: "CANCELLED", actualEtd: day, customer: "X" }),
  m({ id: "i", jobNo: "1100", status: "FRESH_PO", poDate: "2026-10-10", customer: "Pushed Co" }),
];
const po = (p: Partial<FpoRow> & Pick<FpoRow, "id">): FpoRow => ({
  requestNo: null,
  board: "FRESH",
  stage: "DEMAND_PENDING",
  customer: null,
  supplier: null,
  product: null,
  demandPoc: null,
  poDate: "",
  poQty: null,
  qtyToDispatch: null,
  notes: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  ...p,
});
const fpo = [
  po({ id: "p1", requestNo: 1, poDate: "2026-09-23", customer: "Zeta Crop", stage: "SUPPLY_PENDING" }),
  po({ id: "p2", requestNo: 14, poDate: "2026-10-27", customer: "Eta Inox" }),
  po({ id: "p3", requestNo: 9, poDate: "", customer: "No date" }),
  po({ id: "p4", requestNo: 2, poDate: "2026-07-09", customer: "Delta Seeds", board: "LONG_HOLD" }),
  po({ id: "p5", requestNo: 5, poDate: "2026-10-01", board: "MIS" }),
];

describe("shipmentReports", () => {
  it("summarises the dispatch plan and in-transit timelines per PoC", () => {
    const { summary: s } = shipmentReports({ mis, fpo, day });
    expect(s.plan.count).toBe(3);
    expect(s.plan.rows.map((r) => [r.poc, r.n, r.before, r.tomorrow, r.post, r.none, r.picked])).toEqual([
      ["Kiran", 0, 0, 0, 0, 0, 1],
      ["Lata", 2, 0, 1, 1, 0, 0],
      ["Not Assigned", 1, 0, 0, 0, 1, 0],
    ]);
    expect(s.transit.count).toBe(2);
    expect([s.transit.total.before, s.transit.total.tomorrow, s.transit.total.delivered]).toEqual([1, 1, 1]);
    expect(s.pickupX2).toBe(3 * 2 + 2);
    expect(s.delivered4).toBe(1);
    expect(s.fresh.count).toBe(4);
    expect(s.fresh.buckets).toEqual([1, 0, 0, 2, 1]); // 1 day, >12 (35 and 18 days), no date
    expect(s.hold.buckets).toEqual([0, 0, 0, 1, 0]);
  });

  it("builds the tables behind it", () => {
    const r = shipmentReports({ mis, fpo, day });
    expect(r.upcoming.map((e) => e.jobNo)).toEqual(["1086", "1088", "1093"]);
    expect(r.transit.map((e) => e.jobNo)).toEqual(["1055", "1064"]);
    expect(r.pipeline.map((p) => [p.jobNo, p.holding])).toEqual([
      ["1", 35],
      ["1100", 18],
      ["14", 1],
      ["9", null],
    ]);
    expect(r.pipeline[0].etd).toBe("TBD – Supply");
    expect(r.longHold.map((p) => [p.jobNo, p.holding])).toEqual([["2", 111]]);
    expect(r.delivered.map((e) => e.jobNo)).toEqual(["1075"]);
  });
});

describe("helpers", () => {
  it("lateBy counts days an actual date is past the plan", () => {
    expect(lateBy("2026-10-27", "2026-10-29")).toBe(2);
    expect(lateBy("", "2026-10-29")).toBeNull();
  });

  it("buckets ages by edge, over the last edge and without a date", () => {
    expect(buckets([0, 4, 5, 8, 12, 13, null], [4, 8, 12])).toEqual([2, 2, 1, 1, 1]);
  });

  it("places a date against the day", () => {
    expect([when("2026-10-20", day), when(day, day), when("2026-10-29", day), when("2026-11-02", day), when("", day)]).toEqual([
      "before",
      "before",
      "tomorrow",
      "post",
      "none",
    ]);
  });
});
