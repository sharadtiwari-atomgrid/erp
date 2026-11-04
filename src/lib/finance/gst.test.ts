import { describe, expect, it } from "vitest";
import {
  buildGstr1,
  buildGstr3b,
  gstr1Json,
  isInterState,
  periodRange,
  recentPeriods,
  setOffItc,
  stateCode,
  uqcOf,
  type GstPurchaseInvoice,
  type GstSalesInvoice,
} from "./gst";

const company = { companyState: "Maharashtra" };

function inv(p: Partial<GstSalesInvoice> & { number: string; lines: GstSalesInvoice["lines"] }): GstSalesInvoice {
  const total = p.lines.reduce((s, l) => s + l.taxable + l.tax, 0);
  return {
    id: p.number,
    date: "2026-10-10",
    status: "ISSUED",
    customerName: "Fictional Traders",
    customerGstin: null,
    customerState: null,
    placeOfSupply: "Maharashtra",
    total,
    ...p,
  };
}

const line = (taxable: number, rate: number, hsn = "3808", unit = "kg", quantity = 10) => ({
  hsn,
  description: `Item ${hsn}`,
  unit,
  quantity,
  taxable,
  rate,
  tax: Math.round(taxable * rate) / 100,
});

const sales: GstSalesInvoice[] = [
  // B2B intra-state, two rates.
  inv({ number: "INV-0101", customerGstin: "27AAAAA0000A1Z5", customerName: "Alpha Agro", lines: [line(10000, 18), line(5000, 5, "3101", "bag", 4)] }),
  // B2B inter-state.
  inv({ number: "INV-0102", customerGstin: "29BBBBB1111B1Z6", customerName: "Beta Farms", placeOfSupply: "Karnataka", lines: [line(20000, 18)] }),
  // B2C large: inter-state, unregistered, above 2.5 lakh.
  inv({ number: "INV-0103", placeOfSupply: "Gujarat", lines: [line(300000, 18, "3808", "kg", 100)] }),
  // B2C small: inter-state but below the threshold.
  inv({ number: "INV-0104", placeOfSupply: "Gujarat", lines: [line(1000, 18)] }),
  // B2C small: intra-state (any value).
  inv({ number: "INV-0105", lines: [line(400000, 18)] }),
  inv({ number: "INV-0106", lines: [line(2000, 18), line(500, 0, "0713", "kg", 5)] }),
  // Cancelled, draft, and other-month invoices.
  inv({ number: "INV-0107", status: "CANCELLED", lines: [line(9999, 18)] }),
  inv({ number: "INV-0108", status: "DRAFT", lines: [line(5555, 18)] }),
  inv({ number: "INV-0099", date: "2026-09-30", lines: [line(7777, 18)] }),
];

describe("helpers", () => {
  it("maps states and units", () => {
    expect(stateCode("Maharashtra")).toBe("27");
    expect(stateCode("29-Karnataka")).toBe("29");
    expect(stateCode("tamil  nadu")).toBe("33");
    expect(stateCode("Atlantis")).toBe("");
    expect(uqcOf("Kg")).toBe("KGS");
    expect(uqcOf("bags")).toBe("BAG");
    expect(uqcOf("widget")).toBe("OTH");
    expect(isInterState("Maharashtra", "27")).toBe(false);
    expect(isInterState("Maharashtra", "Karnataka")).toBe(true);
    expect(isInterState("Maharashtra", null)).toBe(false);
    expect(periodRange("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(recentPeriods("2026-02-10", 3)).toEqual(["2026-02", "2026-01", "2025-12"]);
  });
});

describe("GSTR-1", () => {
  const r = buildGstr1("2026-10", sales, company);

  it("lists B2B invoices invoice-wise with the tax split", () => {
    expect(r.b2b.map((b) => b.number)).toEqual(["INV-0101", "INV-0102"]);
    const [alpha, beta] = r.b2b;
    expect(alpha).toMatchObject({ gstin: "27AAAAA0000A1Z5", taxable: 15000, cgst: 1025, sgst: 1025, igst: 0, posCode: "27", interState: false });
    expect(alpha.items.map((i) => i.rate)).toEqual([5, 18]);
    expect(beta).toMatchObject({ taxable: 20000, igst: 3600, cgst: 0, sgst: 0, posCode: "29", interState: true, value: 23600 });
  });

  it("separates B2C large from B2C small", () => {
    expect(r.b2cl.map((b) => b.number)).toEqual(["INV-0103"]);
    expect(r.b2cl[0].igst).toBe(54000);
    const gujarat = r.b2cs.find((b) => b.posCode === "24")!;
    expect(gujarat).toMatchObject({ rate: 18, taxable: 1000, igst: 180, interState: true });
    const mh18 = r.b2cs.find((b) => b.posCode === "27" && b.rate === 18)!;
    expect(mh18).toMatchObject({ taxable: 402000, cgst: 36180, sgst: 36180, igst: 0 });
    expect(r.b2cs.find((b) => b.posCode === "27" && b.rate === 0)?.taxable).toBe(500);
  });

  it("summarises by HSN, UQC and rate", () => {
    const h = r.hsn.find((x) => x.hsn === "3808" && x.rate === 18)!;
    expect(h.uqc).toBe("KGS");
    expect(h.taxable).toBe(10000 + 20000 + 300000 + 1000 + 400000 + 2000);
    expect(h.quantity).toBe(10 + 10 + 100 + 10 + 10 + 10);
    expect(h.igst + h.cgst + h.sgst).toBeCloseTo(h.taxable * 0.18, 2);
    expect(r.hsn.find((x) => x.hsn === "3101")).toMatchObject({ uqc: "BAG", quantity: 4, taxable: 5000, cgst: 125, sgst: 125 });
  });

  it("builds the document summary including cancelled numbers", () => {
    expect(r.docs).toEqual([{ series: "INV-", from: "INV-0101", to: "INV-0107", total: 7, cancelled: 1, net: 6 }]);
  });

  it("totals only issued invoices of the month", () => {
    expect(r.totals.invoices).toBe(6);
    expect(r.totals.taxable).toBe(15000 + 20000 + 300000 + 1000 + 400000 + 2500);
    expect(r.totals.nilRated).toBe(500);
    const tableTaxable =
      r.b2b.reduce((s, x) => s + x.taxable, 0) + r.b2cl.reduce((s, x) => s + x.taxable, 0) + r.b2cs.reduce((s, x) => s + x.taxable, 0);
    expect(tableTaxable).toBe(r.totals.taxable);
  });

  it("produces offline-tool shaped JSON", () => {
    const json = gstr1Json(r, "27ZZZZZ9999Z1Z9");
    expect(json.fp).toBe("102026");
    expect(json.b2b).toHaveLength(2);
    expect(json.b2b[0]).toMatchObject({ ctin: "27AAAAA0000A1Z5" });
    expect(json.b2cl[0]).toMatchObject({ pos: "24" });
    expect(json.b2cs.find((x) => x.pos === "24")).toMatchObject({ sply_ty: "INTER", rt: 18, txval: 1000 });
    expect(json.doc_issue.doc_det[0].docs[0]).toMatchObject({ from: "INV-0101", to: "INV-0107", cancel: 1, net_issue: 6 });
  });
});

describe("ITC set-off", () => {
  it("uses IGST credit first, then CGST and SGST credit in their own heads, then against IGST", () => {
    const s = setOffItc({ igst: 1000, cgst: 500, sgst: 500 }, { igst: 1200, cgst: 100, sgst: 600 });
    expect(s.utilised.igst).toEqual({ igst: 1000, cgst: 200, sgst: 0 });
    expect(s.utilised.cgst).toEqual({ igst: 0, cgst: 100, sgst: 0 });
    expect(s.utilised.sgst).toEqual({ igst: 0, cgst: 0, sgst: 500 });
    expect(s.cash).toEqual({ igst: 0, cgst: 200, sgst: 0 });
    expect(s.carryForward).toEqual({ igst: 0, cgst: 0, sgst: 100 });
  });

  it("never sets CGST credit against SGST", () => {
    const s = setOffItc({ igst: 0, cgst: 0, sgst: 300 }, { igst: 0, cgst: 500, sgst: 0 });
    expect(s.cash.sgst).toBe(300);
    expect(s.carryForward.cgst).toBe(500);
  });

  it("uses CGST and SGST credit against IGST once their own heads are clear", () => {
    const s = setOffItc({ igst: 900, cgst: 100, sgst: 100 }, { igst: 0, cgst: 400, sgst: 400 });
    expect(s.utilised.cgst).toEqual({ igst: 300, cgst: 100, sgst: 0 });
    expect(s.utilised.sgst).toEqual({ igst: 300, cgst: 0, sgst: 100 });
    expect(s.cash).toEqual({ igst: 300, cgst: 0, sgst: 0 });
  });
});

describe("GSTR-3B", () => {
  const purchases: GstPurchaseInvoice[] = [
    { id: "p1", number: "PI-1", supplierInvoiceNo: "S-9", date: "2026-10-02", status: "POSTED", supplierName: "Gamma Chem", supplierGstin: "27CCCCC2222C1Z7", placeOfSupply: null, supplierState: "Maharashtra", itcEligible: true, taxable: 50000, tax: 9000, total: 59000 },
    { id: "p2", number: "PI-2", supplierInvoiceNo: null, date: "2026-10-12", status: "PAID", supplierName: "Delta Pack", supplierGstin: "24DDDDD3333D1Z8", placeOfSupply: "Gujarat", supplierState: "Gujarat", itcEligible: true, taxable: 10000, tax: 1200, total: 11200 },
    { id: "p3", number: "PI-3", supplierInvoiceNo: null, date: "2026-10-15", status: "POSTED", supplierName: "Epsilon Cafe", supplierGstin: null, placeOfSupply: null, supplierState: "Maharashtra", itcEligible: false, taxable: 1000, tax: 50, total: 1050 },
    { id: "p4", number: "PI-4", supplierInvoiceNo: null, date: "2026-10-20", status: "DRAFT", supplierName: "Draft Co", supplierGstin: null, placeOfSupply: null, supplierState: null, itcEligible: true, taxable: 1, tax: 1, total: 2 },
    { id: "p5", number: "PI-5", supplierInvoiceNo: null, date: "2026-11-01", status: "POSTED", supplierName: "Next Month", supplierGstin: null, placeOfSupply: null, supplierState: null, itcEligible: true, taxable: 1, tax: 1, total: 2 },
  ];
  const g1 = buildGstr1("2026-10", sales, company);
  const g3 = buildGstr3b(g1, purchases, company);

  it("reports outward supplies from GSTR-1 and ITC from eligible posted bills", () => {
    expect(g3.outward).toEqual({ taxable: g1.totals.taxable - 500, igst: g1.totals.igst, cgst: g1.totals.cgst, sgst: g1.totals.sgst });
    expect(g3.nilRated).toBe(500);
    expect(g3.itc).toEqual({ igst: 1200, cgst: 4500, sgst: 4500 });
    expect(g3.ineligible).toEqual({ igst: 0, cgst: 25, sgst: 25 });
    expect(g3.itcRows.map((r) => r.number)).toEqual(["PI-1", "PI-2"]);
  });

  it("nets tax payable per head after ITC", () => {
    const { cash } = g3.setOff;
    expect(cash.igst).toBe(g1.totals.igst - 1200);
    expect(cash.cgst).toBe(g1.totals.cgst - 4500);
    expect(cash.sgst).toBe(g1.totals.sgst - 4500);
    expect(g3.netPayable).toBeCloseTo(g1.totals.igst + g1.totals.cgst + g1.totals.sgst - 10200, 2);
  });
});
