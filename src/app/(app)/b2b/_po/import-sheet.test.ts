import { describe, expect, test } from "vitest";
import { cleanRow, importChanges, matchPo, parseFreshPoSheet, samePo } from "./import-sheet";

// Fictional data only: the ERP repository is public.
describe("parseFreshPoSheet", () => {
  test("the daily pipeline sheet imports as Fresh POs", () => {
    const { rows, columns, skipped } = parseFreshPoSheet({
      Pipeline: [
        ["Fresh PO - PIPELINE 28/10/2026 17:11:17"],
        ["Job No.", "PO Holding days", "PO Date", "Supplier", "Customer", "AG Demand POC", "Product Name", "Quantity (in KGS)", "Cx Quote approval time", "Blockers and remarks (In case of delayed)"],
        [1, 35, "23/09/2026", "", "Example Agro Pvt Ltd", "Test Person A", "Sample Technical 95%", "500", "", "Dispatch in the second week."],
        [5, 6, "03/10/2026", "Demo Warehouse", "Sample Crop Care", "Test Person B", "Demo Formulation 25% SC", "1,250", "", ""],
        ["", "", "", "", "", "", "", "", "", ""],
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      requestNo: "1",
      poDate: "2026-09-23",
      customer: "Example Agro Pvt Ltd",
      demandPoc: "Test Person A",
      product: "Sample Technical 95%",
      qtyToDispatch: "500",
      notes: "Dispatch in the second week.",
    });
    expect(rows[1].qtyToDispatch).toBe("1250");
    expect(rows[1].supplier).toBe("Demo Warehouse");
    expect(columns.some((c) => c.key === "demandPoc")).toBe(true);
    expect(skipped).toEqual(["PO Holding days", "Cx Quote approval time"]);
  });

  test("a sheet with the Fresh PO column names", () => {
    const { rows } = parseFreshPoSheet({
      S: [
        ["Request No.", "Customer", "Product Name", "PO Qty (Kg)", "Rate (Rs./Kg)", "Payment Terms"],
        ["", "Example Agro Pvt Ltd", "Sample Technical 95%", "3275", "805", "90 Days"],
      ],
    });
    expect(rows).toEqual([{ customer: "Example Agro Pvt Ltd", product: "Sample Technical 95%", poQty: "3275", rate: "805", paymentTerms: "90 Days" }]);
  });

  test("Excel serial and Date cells become ISO PO dates", () => {
    const { rows } = parseFreshPoSheet({
      S: [
        ["Customer", "Product Name", "PO Date"],
        ["A Co", "X", 46288],
        ["B Co", "Y", new Date(2026, 8, 23)],
      ],
    });
    expect(rows[0].poDate).toBe("2026-09-23");
    expect(rows[1].poDate).toBe("2026-09-23");
  });

  test("the header may sit below a few title rows, and other sheets are skipped", () => {
    const parsed = parseFreshPoSheet({
      Notes: [["just notes"]],
      Data: [["Title"], [], ["Customer", "Product", "Qty", "Remarks"], ["A Co", "X", "10 kg", "ok"]],
    });
    expect(parsed.sheet).toBe("Data");
    expect(parsed.rows).toEqual([{ customer: "A Co", product: "X", qtyToDispatch: "10", notes: "ok" }]);
  });

  test("no header row", () => {
    expect(() => parseFreshPoSheet({ S: [["a", "b"], [1, 2]] })).toThrow(/No header row/);
  });
});

describe("samePo", () => {
  test("an imported row updates a PO only when Request No., customer and product all match", () => {
    const po = { requestNo: "5", customer: "Example Agro Pvt Ltd.", product: "Sample-Technical 95%" };
    expect(samePo(po, { requestNo: "5", customer: "example agro pvt ltd", product: "Sample Technical 95%" })).toBe(true);
    expect(samePo(po, { requestNo: "5", customer: "Other Co", product: "Sample-Technical 95%" })).toBe(false);
    expect(samePo(po, { requestNo: "6", customer: "Example Agro Pvt Ltd.", product: "Sample-Technical 95%" })).toBe(false);
  });

  test("importing the same sheet again: same customer, product and PO date is the same PO, whatever its number", () => {
    const po = { requestNo: 3, customer: "Demo Industries", product: "Demo Technical", poDate: "2026-09-23" };
    expect(samePo(po, { requestNo: "771", customer: "Demo Industries", product: "DEMO TECHNICAL", poDate: "23/09/26" })).toBe(true);
    expect(samePo(po, { requestNo: "3", customer: "Demo Industries", product: "Demo Technical", poDate: "2026-09-24" })).toBe(false);
  });

  test("a row without a customer never matches", () => {
    expect(samePo({ customer: "", product: "X", requestNo: "1" }, { customer: "", product: "X", requestNo: "1" })).toBe(false);
  });
});

describe("merging an imported row", () => {
  test("only changed, non-blank fields are taken; numbers and dates compare by value", () => {
    const current = { customer: "A Co", product: "X", poQty: "500", poDate: "2026-09-23", notes: "", paymentTerms: "30 Days" };
    const row = cleanRow({ requestNo: "9", customer: "A Co", product: "X", poQty: "500.0", poDate: "23/09/2026", notes: "Call first", paymentTerms: " ", rate: "" });
    expect(importChanges(current, row)).toEqual({ notes: "Call first" });
  });

  test("the match with the same Request No. wins", () => {
    const live = [
      { id: "a", requestNo: "1", customer: "A Co", product: "X" },
      { id: "b", requestNo: "2", customer: "A Co", product: "X" },
    ];
    expect(matchPo(live, { customer: "A Co", product: "X", requestNo: "2" })?.id).toBe("b");
    expect(matchPo(live, { customer: "A Co", product: "Y", requestNo: "2" })).toBeUndefined();
  });
});
