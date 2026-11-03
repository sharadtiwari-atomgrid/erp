import { describe, expect, it } from "vitest";
import { approvalClashes, approvalPatch, backfill, blankBid, fromMis, matchesSearch, normalizeBids, quoteAmount, stagesOf, toggleStage } from "./board";

// Fictional data only.
const mis = {
  distanceApprox: 412.5,
  supplier: "Acme Agro",
  pickupAddress: "Plot 1, Test Estate",
  pickupPincode: "390001",
  customer: "Beta Chem",
  dropAddress: "Unit 7, Demo Park",
  dropPincode: "",
  quantityKgs: 1250,
  grossWtKg: null,
  packing: "25 kg bags",
  taxableValue: 98000,
  logisticsPaymentTerm: "AG to Pay",
  agDemandPoc: "Lata",
  logisticsType: "",
  transporterDetails: "Sample Roadways (GSTIN …)",
  vehicleType: null,
};

describe("D-0 board", () => {
  it("maps a MIS job to board cells", () => {
    const r = fromMis(mis);
    expect(r.pickupAddress).toBe("Plot 1, Test Estate - 390001");
    expect(r.deliveryAddress).toBe("Unit 7, Demo Park");
    expect(r.distance).toBe("412.5");
    expect(r.grossWt).toBe("");
    expect(r.vehicleArrangements).toBe("Sample Roadways (GSTIN …)"); // logistics type blank → transporter
  });

  it("back-fills only blank cells", () => {
    expect(backfill({ supplier: "Typed by hand", customer: "", netWeight: null }, mis)).toMatchObject({ customer: "Beta Chem", netWeight: "1250" });
    expect(backfill({ supplier: "Typed by hand" }, mis).supplier).toBeUndefined();
  });

  it("ticks a step and everything before it; unticks it and everything after", () => {
    const a = toggleStage([], 2);
    expect(a.vehicleStages).toEqual(["Quotation Approved", "Transporter Aligned", "Vehicle Details Received"]);
    expect(a.vehicleStatus).toBe("Vehicle Details Received");
    const b = toggleStage(a.vehicleStages, 1);
    expect(b).toEqual({ vehicleStages: ["Quotation Approved"], vehicleStatus: "Quotation Approved" });
    expect(toggleStage(b.vehicleStages, 0)).toEqual({ vehicleStages: [], vehicleStatus: "" });
    expect(stagesOf({ vehicleStages: [], vehicleStatus: "Loaded" })).toHaveLength(5);
  });

  it("approving books the transporter and cost, and AG-to-pay when blank on an AG-pays job", () => {
    const bid = { ...blankBid(), name: "Sample Roadways", quote: "₹ 12,500/-" };
    expect(quoteAmount(bid.quote)).toBe(12500);
    expect(approvalPatch(bid, { logisticsPaymentTerm: "AG to Pay", logisticsCostAgToPay: null })).toEqual({
      transporterDetails: "Sample Roadways",
      totalLogisticsCost: 12500,
      logisticsCostAgToPay: 12500,
    });
    expect(approvalPatch(bid, { logisticsPaymentTerm: "Customer to Pay" })).toEqual({ transporterDetails: "Sample Roadways", totalLogisticsCost: 12500 });
    expect(approvalPatch(bid, { logisticsPaymentTerm: "AG to Pay", logisticsCostAgToPay: 9000 }).logisticsCostAgToPay).toBeUndefined();
  });

  it("finds MIS values the approval would replace", () => {
    const patch = { transporterDetails: "Sample Roadways", totalLogisticsCost: 12500 };
    expect(approvalClashes(patch, { transporterDetails: "Other Carriers", totalLogisticsCost: "12500.00" })).toEqual([["transporterDetails", "Other Carriers"]]);
    expect(approvalClashes(patch, { transporterDetails: "", totalLogisticsCost: null })).toEqual([]);
  });

  it("normalises stored bids and searches transporters too", () => {
    const bids = normalizeBids([{ name: "Sample Roadways", quote: 9000 }]);
    expect(bids).toHaveLength(4);
    expect(bids[0]).toEqual({ name: "Sample Roadways", quote: "9000", tat: "", remarks: "" });
    expect(matchesSearch({ jobNo: "1201", customer: "Beta Chem", supplier: null, bids }, "roadways")).toBe(true);
    expect(matchesSearch({ jobNo: "1201", customer: "Beta Chem", supplier: null, bids }, "gamma")).toBe(false);
  });
});
