import { describe, expect, it } from "vitest";
import { computeDocument, computeLine, splitGst } from "@/lib/totals";

describe("computeLine", () => {
  it("applies discount before tax", () => {
    expect(computeLine({ productId: "p", quantity: 2, unitPrice: 1000, discountPct: 10, taxRate: 18 })).toEqual({
      lineTotal: 1800,
      taxAmount: 324,
    });
  });

  it("rounds to paise", () => {
    expect(computeLine({ productId: "p", quantity: 3, unitPrice: 33.333, discountPct: 0, taxRate: 5 })).toEqual({
      lineTotal: 100,
      taxAmount: 5,
    });
  });
});

describe("computeDocument", () => {
  it("sums lines and keeps their order", () => {
    const doc = computeDocument([
      { productId: "a", quantity: 1, unitPrice: 14500, discountPct: 0, taxRate: 18 },
      { productId: "b", quantity: 10, unitPrice: 320, discountPct: 5, taxRate: 12 },
    ]);
    expect(doc.lines.map((l) => l.position)).toEqual([0, 1]);
    expect(doc.subtotal).toBe(17540);
    expect(doc.taxTotal).toBe(2974.8);
    expect(doc.total).toBe(20514.8);
  });
});

describe("splitGst", () => {
  it("uses CGST + SGST within the same state", () => {
    expect(splitGst(181, "Maharashtra", "maharashtra")).toEqual({ interState: false, cgst: 90.5, sgst: 90.5, igst: 0 });
  });

  it("uses IGST across states", () => {
    expect(splitGst(181, "Maharashtra", "Karnataka")).toEqual({ interState: true, cgst: 0, sgst: 0, igst: 181 });
  });

  it("keeps the halves adding up to the total", () => {
    const { cgst, sgst } = splitGst(0.05, "Delhi", null);
    expect(cgst + sgst).toBeCloseTo(0.05);
  });
});
