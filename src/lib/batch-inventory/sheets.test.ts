import { describe, expect, test } from "vitest";
import { cleanInward, isoDate, labelDate, lineKey, nextGrn, num, rowsFromSheet, withCalc } from "./inward";
import { batchKey, normWarehouse, outKey, rowsFromOutwardSheet } from "./outward";
import { describePSV, parsePSV } from "./psv";
import { cleanEntry, entryKey, problem, qtyKg, registerSummary, rowsFromRegisterSheet } from "./registers";
import { norm, ratio, suggestName } from "./engine";
import { parseWarehouseMis } from "./warehouse-mis";

describe("inward sheet", () => {
  const H = ["SCM Job No. (YY-SF-JN)", "Inward Date", "Location", "Shipment Funnel", "Supply POC", "GRN No.( Unique B,D,G,H)", "Manufacturer", "Supplier", "Product Name", "AG Catalogue Name", "Type", "HSN", "Batch Number", "Units", "Packaging", "UOM", "Net Weight (kg)", "Gross Weight", "Mfg Date", "Exp Date", "Purchase Rate (Per kg)", "Remarks", "Outward Qty", "Instock Qty", "Warehouse Ageing", "Stock & Sell License"];
  const sheet = [
    Array(26).fill(""),
    H,
    ["25-09-0001", "18/11/2025", "AG Warehouse (Panoli)", "Domestic B2B", "Poc One", "1", "Maker A", "Supplier A", "Tolfenpyrad Technical", "Tolfenpyrad Technical", "Technical", "38089910", "TP/S/1001", "18", "25 kg bags", "kg", "450", "453.6", "12/10/2025", "11/10/2027", "2,800.00", "", "450", "0", "N/A", "Not Available"],
    ["1,903", "17/10/2026", "AG Warehouse (Panoli)", "Domestic", "Poc Two", "", "Maker B", "Supplier B", "Additive X-725", "Additive X-725", "Type Not Found", "HSN Not Found", "22610-0001", "15", "Net weight: 200 kg Drum\nGross weight: 208 Kg Drum", "kg", "3000", "3120", "01/10/2026", "30/09/2028", "", "", "", "", "2", "License Required"],
    ["26-09-0002", "20/02/2026", "AG Warehouse (Panoli)", "Domestic B2B", "Poc Three", "93", "X", "X", "TEMBOTRIONE TECHNICAL", "Tembotrione Technical", "Technical", "38089390", "TMB/MG/101/010126", "7", "25 kg bags", "kg", "175", "", "", "", "", "", "200", "0", "N/A", "Yes"],
    Array(26).fill(""),
  ];

  test("reads the inward sheet by its headers", () => {
    const { entries, issues } = rowsFromSheet(sheet);
    expect(entries).toHaveLength(3);
    const [a, b] = entries;
    expect([a.jobNo, a.inwardDate, a.grnNo, a.batchNo, a.units, a.netWeight, a.grossWeight, a.purchaseRate, a.outwardQty, a.license]).toEqual(
      ["25-09-0001", "2025-11-18", "1", "TP/S/1001", 18, 450, 453.6, 2800, 450, "Not Available"]);
    expect(b.jobNo).toBe("1903");
    expect(b.outwardQty).toBeNull();
    expect(b.packaging).toMatch(/^Net weight: 200 kg Drum\nGross/);
    expect(issues).toHaveLength(1);
    expect(issues[0].msg).toMatch(/≠ Net 175 − Outward 200/);
  });

  test("Instock Qty and Warehouse Ageing", () => {
    const [a, b, c] = rowsFromSheet(sheet).entries.map((e) => withCalc(e, "2026-10-19"));
    expect([a.instockQty, a.ageing]).toEqual([0, null]);
    expect([b.instockQty, b.ageing]).toEqual([3000, 2]);
    expect([c.instockQty, c.ageing]).toEqual([-25, null]);
  });

  test("form values are cleaned like sheet values", () => {
    const e = cleanInward({ jobNo: " 1,100 ", inwardDate: "2026-10-19", netWeight: "1,250.5", units: "50", productName: "  X  ", outwardQty: "" });
    expect([e.jobNo, e.inwardDate, e.netWeight, e.units, e.productName, e.outwardQty]).toEqual(["1100", "2026-10-19", 1250.5, 50, "X", null]);
    expect(["18/11/2025", "1/2/26", "2026-03-04", "N/A", "Not mentioned"].map(isoDate)).toEqual(["2025-11-18", "2026-02-01", "2026-03-04", "", ""]);
    expect(["1,000", "N/A", "", "12 kg"].map(num)).toEqual([1000, null, null, 12]);
    expect(lineKey(e)).toBe(lineKey({ ...e }));
  });

  test("inward dates in the future are flagged", () => {
    expect(rowsFromSheet(sheet, "2026-10-10").issues.some((i) => /17\/10\/2026 is in the future/.test(i.msg))).toBe(true);
  });

  test("numbers with units: 25 Kgs, 500kg, ₹800", () => {
    expect(["25 Kgs", "500kg", "1,250.5 kg", "₹800", "Rs. 1,200", "12 Ltr", "abc", "25 bags", ""].map(num)).toEqual([25, 500, 1250.5, 800, 1200, 12, null, null, null]);
  });

  test("label dates: 8-Jun-28, month-year expiry runs to the month end", () => {
    expect(isoDate("8-Jun-28")).toBe("2028-06-08");
    expect([labelDate("Jun-28"), labelDate("02/2028"), labelDate("June 2028", false), labelDate("n/a")]).toEqual(["2028-06-30", "2028-02-29", "2028-06-01", ""]);
  });

  test("next GRN is the highest numeric GRN at the location + 1", () => {
    const lines = [{ location: "W1", grnNo: "7" }, { location: "W1", grnNo: "12" }, { location: "W1", grnNo: "B-3" }, { location: "W2", grnNo: "40" }];
    expect([nextGrn(lines, "W1"), nextGrn(lines, "W2"), nextGrn(lines, "W3")]).toEqual(["13", "41", "1"]);
  });
});

describe("outward sheet", () => {
  const H = ["SCM Job No. (YY-SF-JN)", "OB Date", "Warehouse", "Shipment Funnel", "Customer", "GRN No.", "Product Name", "AG Catalogue Name", "Batch No.", "Qty", "Sale Rate", "", ""];
  const sheet = [
    Array(13).fill(""), H,
    ["25-09-0003", "12/12/2025", "AG warehose (Panoli)", "Domestic", "Customer A", "3", "CTPR", "Chlorantraniliprole technical", "CTP/202501001", "150", "2500", "", ""],
    ["1,904", "18/10/2026", "Ag Warehouse (Panoli) ", "Export", "Customer B", "2", "\tQuizalofop P ethyl Technical", "Quizalofop Technical", "CCO-99/101", "25", "", "", ""],
    ["", "20/12/2025", "AG Ballabgarh warehouse", "Domestic", "Customer C", "", "Metribuzin 70% WP", "", "", "100", "", "", ""],
  ];

  test("reads the outward sheet and tidies warehouses / job numbers", () => {
    const { entries, issues } = rowsFromOutwardSheet(sheet, "2026-10-10");
    expect(entries).toHaveLength(3);
    expect([entries[0].obDate, entries[0].warehouse, entries[0].qty, entries[0].saleRate]).toEqual(["2025-12-12", "AG Warehouse (Panoli)", 150, 2500]);
    expect([entries[1].jobNo, entries[1].warehouse, entries[1].productName, entries[1].saleRate]).toEqual(["1904", "AG Warehouse (Panoli)", "Quizalofop P ethyl Technical", null]);
    expect(issues.some((i) => /18\/10\/2026 is in the future/.test(i.msg))).toBe(true);
    expect(issues.some((i) => /no batch number/.test(i.msg))).toBe(true);
    expect(normWarehouse("Nitrogen Gas filling")).toBe("Nitrogen Gas filling");
    expect(batchKey("TMB/MG/102/010126")).toBe(batchKey("TMB MG 102-010126"));
    expect(outKey(entries[0])).toBe(outKey({ ...entries[0] }));
  });
});

describe("engine names", () => {
  test("name normalisation treats common misspellings alike", () => {
    expect(norm("CHLORANTRANILIRPOLE TECHNICAL")).toBe(norm("Chlorantraniliprole technical"));
    expect(norm("Profenophos Tech")).toBe(norm("PROFENOFOS TECHNICAL"));
  });
  test("ratio and suggestName", () => {
    expect(ratio("ABCD", "ABCD")).toBe(1);
    expect(ratio("ABCD", "ABXD")).toBeCloseTo(0.75);
    expect(suggestName("Thiamethoxam Techncal", ["Thiamethoxam Technical", "Tembotrione Technical"])).toBe("Thiamethoxam Technical");
    expect(suggestName("Something else", ["Thiamethoxam Technical"])).toBeNull();
  });
});

describe("PSV", () => {
  const H = ["Product Name", "Batch No.", "Instock Qty(KG)", "PSV Qty", "Units", "Type of Packaging", "Net Weight", "Gross Weight", "MFG", "EXP"];
  const aoa: unknown[][] = [
    [null, null],
    H,
    ["Product A", 2501001, 50, 2, "NOS", "PAPER BAG", 25, 25.2, "19/10/2025", "18/10/2027"],
    ["Product A", "ACLM0101A001", 3000, 15, "NOS", "HDPE", 200, 220.1, "01/08/2026", "01/07/2028"],
    ["Product A", "ACLMO101A001", 3000, 15, "NOS", "HDPE", 200, "N/A", "01/08/2026", "01/07/2028"],
    ["Product B", "M1", 10, 1, "NOS", "BAG", 10, 9, "06/08/2026", "05/08/2026"],
    ["Product B", "M2", 100, 3, "NOS", "", 25, 25.2, "N/A", "29-0828"],
    ["18X21 PAPER DRUM", "PACKIMG MATERIAL", null, 11, "NOS", null, "N/A", "N/A", "N/A", "N/A"],
    [null, null, null],
  ];

  test("reads a PSV sheet in its own layout", () => {
    const d = parsePSV({ Sheet1: aoa });
    expect(d.stock).toHaveLength(6);
    const a = d.stock[0];
    expect([a.name, a.batch, a.qty, a.units, a.uom, a.pack, a.net, a.gross, a.mfg, a.exp]).toEqual(["Product A", "2501001", 50, 2, "NOS", "PAPER BAG", 25, 25.2, "2025-10-19", "2027-10-18"]);
    expect(d.date).toBeNull();
    expect(d.total).toBe(50 + 3000 + 3000 + 10 + 100);
  });

  test("flags the lines that need a look", () => {
    const msgs = parsePSV({ Sheet1: aoa }).issues.map((i) => `${i.row}: ${i.msg}`);
    const has = (row: number, re: RegExp) => expect(msgs.some((m) => m.startsWith(row + ":") && re.test(m)), `row ${row} ${re}`).toBe(true);
    has(5, /also written “ACLM0101A001”/);
    has(6, /lighter than net/);
    has(6, /on or before MFG/);
    has(7, /≠ 3 units × 25 kg/);
    has(7, /packaging is blank/);
    has(7, /EXP “29-0828” isn't a date/);
    has(8, /No in-stock quantity/);
    has(8, /No batch number/);
    expect(describePSV({ ...parsePSV({ Sheet1: aoa }), date: "2026-10-15" }).info).toMatch(/PSV 2026-10-15 · 6 batch lines · 3 materials/);
  });

  test("finds a date written above the table", () => {
    expect(parsePSV({ S: [["PSV Date:", "15/10/2026"], H, ["Product A", "B1", 25, 1, "NOS", "BAG", 25, 25.2, null, null]] }).date).toBe("2026-10-15");
  });
});

describe("warehouse MIS", () => {
  test("reads the Stock in Hand tab and its date", () => {
    const wh = parseWarehouseMis({
      Inward: [["x"]],
      "Stock in Hand": [
        [" STOCK COUNT", "27/10/2026"],
        ["TOTAL", 13150],
        ["Sr. No", "Material Description", "Batch No", "Qty Received", "Qty Dispatched", "Closing Stock"],
        [1, "TEBUCONAZOLE TECH", "TB-1", "11,875", 11625, 250],
        [2, "Total", "", 0, 0, 0],
      ],
    });
    expect(wh.date).toBe("2026-10-27");
    expect(wh.sheet).toBe("Stock in Hand");
    expect(wh.rows).toEqual([{ name: "TEBUCONAZOLE TECH", batch: "TB-1", received: 11875, dispatched: 11625, closing: 250 }]);
    expect(() => parseWarehouseMis({ S: [["a", "b"]] })).toThrow(/Stock in Hand/);
  });
});

describe("registers", () => {
  test("quantities as written: kgs, gms, MT", () => {
    expect(["25 Kgs", "250 gms", "3.65 kgs", "2kg ", "1 Kg", "1 MT", "16", "three"].map(qtyKg)).toEqual([25, 0.25, 3.65, 2, 1, 1000, 16, null]);
  });

  test("lost and found: expected loss from qty × price; status kept to the list", () => {
    const e = cleanEntry("lost-found", { productName: "CTPR", qty: "3.65 kgs", price: "4050", status: "loop closed", etd: "28-05-2026" });
    expect([e.qty, e.expectedLoss, e.status, e.etd]).toEqual([3.65, 14782.5, "Loop closed", "2026-05-28"]);
    expect(cleanEntry("lost-found", { productName: "X", qty: 1, price: 10, expectedLoss: 99 }).expectedLoss).toBe(99);
    expect(problem(cleanEntry("lost-found", { qty: 1 }))).toBe("Enter the product.");
  });

  test("lost and found: reads the Inventory Loss sheet", () => {
    const aoa = [
      ["", "", "", "Origin", "Destn."],
      [],
      ["Sl. No.", "Issue date", "SCM Job No.", "Sx / WH / JW", "Cx / JW / WH", "Product Name", "Qty.", "Credit Note", "Batch No.", "ETD", "Price (Rs. / Kg)", "Expected Losses", "Insurrance Claimed", "Remarks", "Story", "Timeline", "POC Solving", "Next Actionables", "Final Status", "Monetry Hit taken By"],
      ["1", "", "501", "AG Warehouse (Panoli)", "Customer Z", "Pymetrozine 50% WG", "270 kgs", "Pending", "", "29/07/2026", "500", "135000", "", "Sent 270 kg extra", "", "03/08/2026", "Poc One", "", "Loop open", "", "follow up"],
      ["2", "", "502", "Supplier Q", "Panoli WH", "Trifloxystrobin", "2kg", "Pending", "", "07/10/2026", "08/10/2026", "4000"],
    ];
    const { entries, issues } = rowsFromRegisterSheet("lost-found", aoa);
    expect(entries.map((e) => [e.jobNo, e.qty, e.etd, e.expectedLoss, e.status])).toEqual([["501", 270, "2026-07-29", 135000, "Loop open"], ["502", 2, "2026-10-07", 4000, "Loop open"]]);
    expect(entries[0].notes).toBe("follow up");
    expect(entries[0].destination).toBe("Customer Z");
    expect(issues.map((x) => x.msg).join(" | ")).toMatch(/price “08\/10\/2026” isn't a number/);
    expect(entryKey(entries[0])).not.toBe(entryKey(entries[1]));
  });

  test("damage: relabelling keeps the new batch; summaries", () => {
    const e = cleanEntry("damage", { type: "Relabelling", productName: "Thiamethoxam", batchNo: "A1", newBatchNo: "A1-R", qty: "50", date: "21/10/2026" });
    expect([e.type, e.newBatchNo, e.qty, e.status, e.date]).toEqual(["Relabelling", "A1-R", 50, "Open", "2026-10-21"]);
    const d = cleanEntry("damage", { type: "Damage", productName: "Y", qty: "12.5", status: "Closed" });
    expect(registerSummary("damage", [e, d])).toMatchObject({ open: 1, kgDamaged: 12.5, relabelled: 1 });
    const lf = [
      cleanEntry("lost-found", { productName: "A", qty: 10, price: 100, hitBy: "AG", status: "Loop closed" }),
      cleanEntry("lost-found", { productName: "B", qty: 5, price: 10 }),
    ];
    expect(registerSummary("lost-found", lf)).toMatchObject({ open: 1, atStake: 50, byAg: 1000 });
  });
});
