import { describe, expect, it } from "vitest";
import { checkBillLines, computeBill, unbilledPoQuantities, type BillLine } from "./bill-lines";

const item: BillLine = { kind: "item", productId: "p1", glAccountId: null, description: null, hsnCode: "3808", quantity: 10, unitPrice: 100, discountPct: 10, taxRate: 18 };
const freight: BillLine = { kind: "expense", productId: null, glAccountId: "g1", description: "Freight", hsnCode: "9965", quantity: 1, unitPrice: 1000, discountPct: 0, taxRate: 5 };

describe("purchase invoice lines", () => {
  it("computes line and document totals", () => {
    const bill = computeBill([item, freight]);
    expect(bill.lines.map((l) => [l.lineTotal, l.taxAmount])).toEqual([[900, 162], [1000, 50]]);
    expect(bill).toMatchObject({ subtotal: 1900, taxTotal: 212, total: 2112 });
  });

  it("validates item and expense lines", () => {
    expect(checkBillLines([item, freight])).toBeNull();
    expect(checkBillLines([])).toMatch(/at least one/);
    expect(checkBillLines([{ ...item, productId: null }])).toMatch(/choose an item/);
    expect(checkBillLines([{ ...freight, glAccountId: null }])).toMatch(/ledger account/);
    expect(checkBillLines([{ ...item, quantity: 0 }])).toMatch(/quantity/);
  });

  it("bills what was received less what was already billed", () => {
    const lines = [
      { id: "l1", productId: "p1", receivedQty: 10 },
      { id: "l2", productId: "p1", receivedQty: 5 },
      { id: "l3", productId: "p2", receivedQty: 0 },
    ];
    const out = unbilledPoQuantities(lines, new Map([["p1", 12]]));
    expect(Object.fromEntries(out)).toEqual({ l1: 0, l2: 3, l3: 0 });
  });
});
