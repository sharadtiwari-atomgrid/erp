import { describe, expect, it } from "vitest";
import { analyseNeeds, type NeedLine, type NeedProduct } from "./needs";

const chair: NeedProduct = {
  id: "chair",
  supplyMode: "MTS",
  itemType: "FINISHED_GOOD",
  bom: { outputQty: 1, lines: [{ componentId: "tube", quantity: 2, scrapPct: 0 }] },
};
const cable: NeedProduct = { id: "cable", supplyMode: "BUY", itemType: "TRADING", bom: null };
const products = new Map([chair, cable].map((p) => [p.id, p]));

const line = (id: string, productId: string, outstanding: number, day: number | null, extra: Partial<NeedLine> = {}): NeedLine => ({
  id,
  salesOrderId: "so",
  warehouseId: "wh",
  requiredDate: day === null ? null : new Date(2026, 10, day),
  productId,
  outstanding,
  reservedForLine: 0,
  ...extra,
});

describe("analyseNeeds", () => {
  it("gives stock to the earliest required line first", () => {
    const result = analyseNeeds({
      lines: [line("late", "chair", 5, 20), line("early", "chair", 5, 10)],
      products,
      stock: new Map([["chair:wh", 6]]),
      openOrders: [],
      componentStock: new Map([["tube", 100]]),
    });
    const early = result.find((r) => r.lineId === "early")!;
    const late = result.find((r) => r.lineId === "late")!;
    expect(early.recommendation).toBe("DISPATCH");
    expect(late).toMatchObject({ recommendation: "PRODUCE", fromStock: 1, gap: 4 });
    expect(late.components).toEqual([{ componentId: "tube", required: 8, available: 100, short: 0 }]);
  });

  it("counts open production orders and flags component shortfalls", () => {
    const result = analyseNeeds({
      lines: [line("a", "chair", 10, 10), line("b", "chair", 10, 11)],
      products,
      stock: new Map(),
      openOrders: [
        { id: "mo-linked", productId: "chair", salesOrderLineId: "a", remaining: 10 },
        { id: "mo-stock", productId: "chair", salesOrderLineId: null, remaining: 4 },
      ],
      componentStock: new Map([["tube", 5]]),
    });
    expect(result[0]).toMatchObject({ lineId: "a", recommendation: "IN_PRODUCTION", inProduction: 10, productionOrderIds: ["mo-linked"] });
    expect(result[1]).toMatchObject({ lineId: "b", recommendation: "PRODUCE", inProduction: 4, gap: 6 });
    expect(result[1].components[0]).toMatchObject({ required: 12, short: 7 });
  });

  it("recommends procurement for bought items", () => {
    const [r] = analyseNeeds({ lines: [line("c", "cable", 3, null)], products, stock: new Map(), openOrders: [], componentStock: new Map() });
    expect(r.recommendation).toBe("PROCURE");
  });

  it("treats the line's own reservation as available to it", () => {
    const [r] = analyseNeeds({
      lines: [line("r", "chair", 4, 5, { reservedForLine: 4 })],
      products,
      stock: new Map([["chair:wh", 0]]),
      openOrders: [],
      componentStock: new Map(),
    });
    expect(r.recommendation).toBe("DISPATCH");
  });
});
