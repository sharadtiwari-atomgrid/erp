import { describe, expect, it } from "vitest";
import { fixText, monthYear, parseCOA, parsePasted, type TextItem } from "./parse";

// Text positions laid out the way pdf.js reads two typical supplier COAs.
// Every company, product and number here is fictional.
const t = (str: string, x: number, y: number, w: number, h = 12): TextItem => ({ str, x, y, w, h, page: 1 });

const threeColumn: TextItem[] = [
  t("SAMPLE FINE CHEM PVT. LTD.", 198, 56, 217, 13),
  t("Plot 1, Example Industrial Estate, Sample Town 000000", 113, 73, 385, 9),
  t("GSTIN: 00AAAAA0000A0Z0", 248, 83, 115, 9),
  t("CERTIFICATE OF ANALYSIS", 215, 104, 181, 13),
  t("Product Name : Zentrofos Technical", 60, 133, 219),
  t("Batch No. : ZT2607102", 376, 133, 119),
  t("Mfg. Date : 01/07/2026", 60, 150, 122),
  t("Exp. Date : 30/06/2028", 376, 150, 123),
  t("A.R. No. : QC/26/0001", 60, 166, 119),
  t("Quantity : 850 Kg", 376, 166, 93),
  t("Test Parameter", 123, 198, 86),
  t("Specification", 316, 198, 75),
  t("Result", 475, 198, 37),
  t("Appearance", 63, 228, 65),
  t("Off white to light brown", 279, 221, 122),
  t("crystalline powder", 279, 235, 96),
  t("Off white powder", 438, 228, 90),
  t("Zentrofos content (% w/w)", 63, 258, 168),
  t("Min. 98.0", 279, 258, 49),
  t("98.6", 438, 258, 23),
  t("Moisture content (% w/w)", 63, 281, 135),
  t("Max. 0.5", 279, 281, 46),
  t("0.18", 438, 281, 23),
  t("pH (1% aqueous solution)", 63, 304, 138),
  t("5.0 - 8.0", 279, 304, 44),
  t("6.4", 438, 304, 17),
  t("Melting point", 63, 328, 68),
  t("139 - 141 oC", 279, 328, 69),
  t("140 oC", 438, 328, 39),
  t("Acetone insoluble (% w/w)", 63, 351, 141),
  t("Max. 0.5", 279, 351, 46),
  t("0.12", 438, 351, 23),
  t("Remarks : The above batch complies with the specification.", 58, 379, 236, 9),
  t("Checked By", 58, 420, 49, 9),
  t("Approved By (QC Head)", 131, 420, 98, 9),
];

const grouped: TextItem[] = [
  t("EXAMPLE AGRO SCIENCES LIMITED", 201, 56, 210, 13),
  t("Unit 2, Sample Estate 000000 · www.example.test", 188, 73, 235, 9),
  t("Certificate of Analysis", 235, 94, 141, 13),
  t("Name of Product: Quorvalin Technical", 60, 123, 208),
  t("Lot No: QV10326PF021", 60, 139, 137),
  t("Customer: Sample Buyer Pvt Ltd", 60, 156, 226),
  t("S. No.", 66, 199, 34),
  t("Characteristics", 158, 199, 87),
  t("Requirements", 351, 187, 80),
  t("Results", 498, 199, 43),
  t("Minimum", 327, 211, 53),
  t("Maximum", 421, 211, 55),
  t("1", 80, 234, 7),
  t("Description", 172, 234, 60),
  t("Pale yellow liquid", 308, 234, 92),
  t("-", 447, 234, 4),
  t("Complies", 495, 234, 50),
  t("2", 80, 257, 7),
  t("Purity by GC (% w/w)", 145, 257, 114),
  t("94.0", 342, 257, 23),
  t("-", 447, 257, 4),
  t("95.2", 508, 257, 23),
  t("3", 80, 280, 7),
  t("Water content by KF (% w/w)", 124, 280, 155),
  t("-", 352, 280, 4),
  t("0.2", 440, 280, 17),
  t("0.05", 508, 280, 23),
  t("4", 80, 304, 7),
  t("Acidity as H2SO4 (% w/w)", 132, 304, 140),
  t("-", 352, 304, 4),
  t("0.3", 440, 304, 17),
  t("0.11", 509, 304, 22),
  t("5", 80, 327, 7),
  t("Specific gravity @ 20 C", 139, 327, 125),
  t("1.44", 342, 327, 23),
  t("1.47", 437, 327, 23),
  t("1.455", 505, 327, 30),
  t("Date of Manufacture: 06-03-2026", 58, 355, 133, 9),
  t("Date of Expiry: 05-03-2028", 208, 355, 108, 9),
  t("Conclusion: The material conforms to the specification.", 58, 375, 218, 9),
  t("Authorised Signatory", 58, 394, 84, 9),
];

describe("parseCOA", () => {
  it("3-column COA: header fields, wrapped cells, degree signs", () => {
    const r = parseCOA(threeColumn);
    expect([r.tradeName, r.batchNo, r.mfgDate, r.expDate]).toEqual(["Zentrofos Technical", "ZT2607102", "01/07/2026", "30/06/2028"]);
    // Letterhead GSTIN / address lines are left out.
    expect(r.extraFields).toEqual([
      { label: "A.R. No.", value: "QC/26/0001" },
      { label: "Quantity", value: "850 Kg" },
    ]);
    expect(r.columns).toEqual(["Test Parameter", "Specification", "Result"]);
    expect(r.rows).toHaveLength(6);
    expect(r.rows[0]).toEqual(["Appearance", "Off white to light brown crystalline powder", "Off white powder"]);
    expect(r.rows[4]).toEqual(["Melting point", "139 - 141°C", "140°C"]);
    expect(r.remarks).toBe("The above batch complies with the specification.");
  });

  it("grouped COA: S. No., Requirements over Min / Max, dates under the table", () => {
    const r = parseCOA(grouped);
    expect([r.tradeName, r.batchNo, r.mfgDate, r.expDate]).toEqual(["Quorvalin Technical", "QV10326PF021", "06-03-2026", "05-03-2028"]);
    expect(r.columns).toEqual(["S. No.", "Characteristics", "Minimum", "Maximum", "Results"]);
    expect(r.groupHeader).toBe("Requirements");
    expect(r.rows.map((x) => x[0])).toEqual(["1", "2", "3", "4", "5"]);
    expect(r.rows[3]).toEqual(["4", "Acidity as H₂SO₄ (% w/w)", "-", "0.3", "0.11"]);
    expect(r.rows[4][1]).toBe("Specific gravity @ 20°C");
    expect(r.extraFields).toEqual([{ label: "Customer", value: "Sample Buyer Pvt Ltd" }]);
  });

  it("ruled lines (scans) decide the rows", () => {
    const it2 = (str: string, x: number, y: number): TextItem => ({ str, x, y, w: str.length * 9, h: 16, page: 1 });
    const items = [
      it2("Test", 100, 100), it2("Specification", 400, 100), it2("Result", 700, 100),
      it2("Description", 100, 160), it2("White free", 400, 150), it2("flowing powder", 400, 172), it2("Complies", 700, 160),
      it2("Purity", 100, 220), it2("Min 98%", 400, 220), it2("98.5%", 700, 220),
    ];
    const rules = { h: [{ y: 130, x0: 90, x1: 800 }, { y: 200, x0: 90, x1: 800 }, { y: 250, x0: 90, x1: 800 }] };
    const r = parseCOA(items, { rules });
    expect(r.rows).toEqual([
      ["Description", "White free flowing powder", "Complies"],
      ["Purity", "Min 98%", "98.5%"],
    ]);
  });

  it("drops OCR noise", () => {
    const items: TextItem[] = [
      { str: "Product Name : Sample Blend", x: 10, y: 10, w: 200, h: 12, page: 1, conf: 90 },
      { str: "|", x: 300, y: 10, w: 4, h: 12, page: 1, conf: 90 },
      { str: "xq", x: 320, y: 10, w: 10, h: 12, page: 1, conf: 20 },
    ];
    expect(parseCOA(items).tradeName).toBe("Sample Blend");
  });
});

describe("text helpers", () => {
  it("text fixes", () => {
    expect(fixText("Specific gravity @ 25 oC")).toBe("Specific gravity @ 25°C");
    expect(fixText("Acidity as H2SO4, NaHCO3 and Ca(OH)2")).toBe("Acidity as H₂SO₄, NaHCO₃ and Ca(OH)₂");
    expect(fixText("Batch QV10326PF023 at 20 C")).toBe("Batch QV10326PF023 at 20°C"); // codes stay as they are
    expect(fixText("IS 200 mesh")).toBe("IS 200 mesh");
  });

  it("COA dates show as month-year", () => {
    expect(["01/07/2026", "2026-07-01", "28.09.2026", "07-2026", "July 2026", "N/A"].map(monthYear)).toEqual([
      "Jul-2026", "Jul-2026", "Sep-2026", "Jul-2026", "Jul-2026", "N/A",
    ]);
  });

  it("a pasted table", () => {
    const r = parsePasted("Parameter\tSpecification\tResult\nPurity\tMin 98%\t98.6%\nMoisture\tMax 0.5%");
    expect(r.columns).toEqual(["Parameter", "Specification", "Result"]);
    expect(r.rows).toEqual([
      ["Purity", "Min 98%", "98.6%"],
      ["Moisture", "Max 0.5%", ""],
    ]);
  });

  it("a pasted table with wide spaces", () => {
    const r = parsePasted("Test   Limit   Result\nAssay   Min 95%   96.1%");
    expect(r.rows).toEqual([["Assay", "Min 95%", "96.1%"]]);
  });
});
