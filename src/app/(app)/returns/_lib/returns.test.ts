import { describe, expect, it } from "vitest";
import { closeBlocker, remainingQty, suggestedCredit, unitPriceMap } from "./returns";

describe("unitPriceMap", () => {
  it("uses taxable value plus GST per unit, averaged across lines", () => {
    const prices = unitPriceMap([
      { productId: "a", quantity: 10, lineTotal: 900, taxAmount: 162 }, // 100 × 10, 10% off, 18% GST
      { productId: "b", quantity: 2, lineTotal: 100, taxAmount: 0 },
      { productId: "b", quantity: 2, lineTotal: 200, taxAmount: 0 },
      { productId: "c", quantity: 0, lineTotal: 0, taxAmount: 0 },
    ]);
    expect(prices.get("a")).toBeCloseTo(106.2);
    expect(prices.get("b")).toBe(75);
    expect(prices.has("c")).toBe(false);
  });
});

describe("suggestedCredit", () => {
  const prices = new Map([
    ["a", 106.2],
    ["b", 75],
  ]);
  const lines = [
    { productId: "a", quantity: 3, receivedQty: 2 },
    { productId: "b", quantity: 1, receivedQty: 1 },
    { productId: "x", quantity: 5, receivedQty: 5 },
  ];
  it("uses requested quantities before receipt and received ones after", () => {
    expect(suggestedCredit(lines, prices, false)).toBe(393.6);
    expect(suggestedCredit(lines, prices, true)).toBe(287.4);
  });
});

describe("closeBlocker", () => {
  it("requires inspection and finished repairs", () => {
    expect(closeBlocker("RECEIVED", [])).toMatch(/inspected/);
    expect(closeBlocker("INSPECTED", [{ disposition: "REPAIR", receivedQty: 1, repairedAt: null }])).toMatch(/awaiting repair/);
    expect(closeBlocker("INSPECTED", [{ disposition: "REPAIR", receivedQty: 1, repairedAt: new Date() }, { disposition: "SCRAP", receivedQty: 1, repairedAt: null }])).toBeNull();
  });
});

describe("remainingQty", () => {
  it("subtracts quantities already on other returns", () => {
    const left = remainingQty(new Map([["a", 5], ["b", 2]]), new Map([["a", 2], ["b", 3]]));
    expect(left.get("a")).toBe(3);
    expect(left.get("b")).toBe(0);
  });
});
