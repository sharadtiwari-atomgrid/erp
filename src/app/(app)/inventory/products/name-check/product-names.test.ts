import { describe, expect, it } from "vitest";
import { classOf, funnelOf, nameKey, parseProductMaster, productMatcher, tokens } from "./product-names";

// Fictional products only.
const sheet = [
  ["Product Master"],
  ["Product ID", "Product Name", "Inward Name", "Outward Name", "Product Type", "CAS No.", "Atomgrid HSN Code", "Product Funnel"],
  ["PRD-0001", "QUORANTRAVILONE TECHNICAL", "N-SAMPLE-CARBOXAMIDE", "QTV Technical", "Technical", "000000-00-1", "38081011", "B2B"],
  ["PRD-0002", "ZENTROFOS TECHNICAL", "ZENTROFOS TECHNICAL", "ZENTROFOS TECHNICAL", "Technical", "-", "38089199", "B2B"],
  ["PRD-0003", "ZENTRA 11% + VORIZOLE 18.30% SC", "", "", "Formulation", "", "38089290", "B2B"],
  ["PRD-0004", "MELVAPROP-P-ETHYL TECHNICAL", "ZX-66", "Melvaprop Technical", "", "", "", "b2c"],
  ["PRD-0005", "(R)-2-[4-SAMPLEOXY]PROPANOIC ACID", "ZX-66 | Melvaprop Technical", "", "Intermediate", "", "", "B2B"],
  ["", "zentrofos technical", "", "", "", "", "", ""],
  ["", "", "", "", "", "", "", ""],
];

describe("parseProductMaster", () => {
  it("reads products with their other names, skipping blanks and duplicates", () => {
    const p = parseProductMaster(sheet);
    expect(p).toHaveLength(5);
    expect(p[0]).toEqual({
      code: "PRD-0001", name: "QUORANTRAVILONE TECHNICAL", type: "Technical", casNo: "000000-00-1", hsn: "38081011", funnel: "B2B",
      aliases: ["N-SAMPLE-CARBOXAMIDE", "QTV Technical"],
    });
    expect(p[1].aliases).toEqual([]);
    expect(p[1].casNo).toBe("");
    expect(p[4].aliases).toEqual(["ZX-66", "Melvaprop Technical"]);
  });

  it("needs a Product Name column", () => {
    expect(() => parseProductMaster([["Name of thing"], ["x"]])).toThrow(/Product Name/);
  });
});

describe("productMatcher", () => {
  const m = productMatcher(parseProductMaster(sheet));

  it("classifies names", () => {
    expect(m("ZENTROFOS TECHNICAL")).toEqual({ kind: "exact", to: "ZENTROFOS TECHNICAL", options: ["ZENTROFOS TECHNICAL"] });
    expect(m("Zentrofos  Technical").kind).toBe("case");
    expect(m("QTV Technical")).toMatchObject({ kind: "alias", to: "QUORANTRAVILONE TECHNICAL" });
    expect(m("Melvaprop Technical")).toMatchObject({ kind: "ambiguous", to: "" });
    expect(m("Melvaprop Technical").options).toHaveLength(2);
    expect(m("Quorantavilone tech")).toMatchObject({ kind: "close", to: "QUORANTRAVILONE TECHNICAL" });
    expect(m("Zentra 11.0% + Vorizole 18.3% SC").to).toBe("ZENTRA 11% + VORIZOLE 18.30% SC");
    expect(m("Multiple Products").kind).toBe("unknown");
    expect(m("").kind).toBe("unknown");
  });

  it("uses token synonyms", () => {
    expect(tokens("Sample TC 50 WDG 18.30% ppt")).toEqual(["sample", "tech", "50", "wg", "18.3%", "precipitated"]);
    expect(nameKey(" Sample  Technical 18.3%+X ")).toBe("sampletechnical18.3%+x");
  });
});

describe("sheet values", () => {
  it("maps type and funnel", () => {
    expect(["Technical", "tech grade", "Formulation", "Intermediate", "Adjuvant", ""].map(classOf)).toEqual([
      "Technical", "Technical", "Formulation", "Intermediate", "Other", null,
    ]);
    expect(["B2B", "b2c", " B 2 B ", "Retail"].map(funnelOf)).toEqual(["B2B", "B2C", "B2B", null]);
  });
});
