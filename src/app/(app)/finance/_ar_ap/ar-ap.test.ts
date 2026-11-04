import { describe, expect, it } from "vitest";
import { assertBalanced } from "@/lib/finance/chart";
import { autoApply, checkApplications, cleanApplications, receiptSplit, sortOldestFirst, totalApplied, vendorPaymentSplit, type OpenDoc } from "./apply";
import { ageDocuments, balanceAsOf, bucketOf, daysOverdue, dueWithin, overdue, type AgingDoc } from "./aging";
import { purchaseInvoicePostingLines, receiptPostingLines, vendorPaymentPostingLines } from "./postings";
import { computeTds, isCompanyDeductee, panOf, taxableShare, tdsAmount, tdsRateFor } from "./tds";

const docs: OpenDoc[] = [
  { id: "b", number: "INV-00002", docDate: "2026-09-01", dueDate: "2026-10-01", balance: 500 },
  { id: "a", number: "INV-00001", docDate: "2026-08-01", dueDate: "2026-09-01", balance: 300 },
  { id: "c", number: "INV-00003", docDate: "2026-10-01", dueDate: null, balance: 1000 },
];

describe("applications", () => {
  it("sorts oldest first by due date, falling back to the document date", () => {
    expect(sortOldestFirst(docs).map((d) => d.id)).toEqual(["a", "b", "c"]);
  });

  it("auto-applies oldest first and never more than a balance", () => {
    expect(autoApply(docs, 650)).toEqual({ a: 300, b: 350 });
    expect(autoApply(docs, 5000)).toEqual({ a: 300, b: 500, c: 1000 });
    expect(autoApply(docs, 0)).toEqual({});
  });

  it("cleans, merges and totals applications", () => {
    const apps = cleanApplications([
      { docId: "a", amount: 100.004 },
      { docId: "a", amount: 50 },
      { docId: "b", amount: 0 },
    ]);
    expect(apps).toEqual([{ docId: "a", amount: 150 }]);
    expect(totalApplied(apps)).toBe(150);
  });

  it("rejects over-application and unknown documents", () => {
    expect(checkApplications([{ docId: "a", amount: 300 }], docs)).toBeNull();
    expect(checkApplications([{ docId: "a", amount: 300.5 }], docs)).toMatch(/INV-00001/);
    expect(checkApplications([{ docId: "zz", amount: 1 }], docs)).toMatch(/no longer open/);
  });

  it("splits a receipt into applied cash and advance", () => {
    expect(receiptSplit({ amount: 1000, tds: 0, applied: 600 })).toEqual({ ok: true, cashApplied: 600, unapplied: 400 });
    // ₹9,800 received against a ₹10,000 invoice with ₹200 TDS deducted.
    expect(receiptSplit({ amount: 9800, tds: 200, applied: 10000 })).toEqual({ ok: true, cashApplied: 9800, unapplied: 0 });
    expect(receiptSplit({ amount: 1000, tds: 0, applied: 1200 }).ok).toBe(false);
    expect(receiptSplit({ amount: 1000, tds: 50, applied: 0 }).ok).toBe(false);
    expect(receiptSplit({ amount: 0, tds: 0, applied: 0 }).ok).toBe(false);
  });

  it("works out the cash on a vendor payment", () => {
    expect(vendorPaymentSplit({ applied: 11800, tds: 200, advance: 0 })).toEqual({ ok: true, cash: 11600 });
    expect(vendorPaymentSplit({ applied: 0, tds: 0, advance: 5000 })).toEqual({ ok: true, cash: 5000 });
    expect(vendorPaymentSplit({ applied: 100, tds: 200, advance: 0 }).ok).toBe(false);
    expect(vendorPaymentSplit({ applied: 0, tds: 0, advance: 0 }).ok).toBe(false);
  });
});

describe("aging", () => {
  it("counts days overdue from the due date, or the document date", () => {
    expect(daysOverdue("2026-11-05", "2026-11-01", "2026-10-01")).toBe(4);
    expect(daysOverdue("2026-11-05", null, "2026-11-10")).toBe(-5);
  });

  it("buckets by days overdue", () => {
    expect([0, -3, 1, 30, 31, 60, 61, 90, 91, 400].map(bucketOf)).toEqual([
      "notDue", "notDue", "d1_30", "d1_30", "d31_60", "d31_60", "d61_90", "d61_90", "d90plus", "d90plus",
    ]);
  });

  it("works out the balance on a past date", () => {
    const payments = [{ date: "2026-10-01", amount: 300 }, { date: "2026-11-01", amount: 200 }];
    expect(balanceAsOf(1000, payments, "2026-10-15")).toBe(700);
    expect(balanceAsOf(1000, payments, "2026-11-01")).toBe(500);
  });

  const aging: AgingDoc[] = [
    { id: "1", number: "INV-1", partyId: "p2", partyName: "Zenith Traders", docDate: "2026-07-01", dueDate: "2026-07-31", total: 1000, balance: 1000 },
    { id: "2", number: "INV-2", partyId: "p1", partyName: "Acme Fictional Ltd", docDate: "2026-10-01", dueDate: "2026-10-20", total: 500, balance: 250 },
    { id: "3", number: "INV-3", partyId: "p1", partyName: "Acme Fictional Ltd", docDate: "2026-11-01", dueDate: "2026-12-01", total: 800, balance: 800 },
    { id: "4", number: "INV-4", partyId: "p1", partyName: "Acme Fictional Ltd", docDate: "2026-11-01", dueDate: "2026-12-01", total: 800, balance: 0 },
  ];

  it("groups per party with bucket totals and a grand total", () => {
    const r = ageDocuments(aging, "2026-11-05");
    expect(r.parties.map((p) => p.partyName)).toEqual(["Acme Fictional Ltd", "Zenith Traders"]);
    expect(r.parties[0].buckets).toEqual({ notDue: 800, d1_30: 250, d31_60: 0, d61_90: 0, d90plus: 0 });
    expect(r.parties[0].total).toBe(1050);
    expect(r.parties[0].docs).toHaveLength(2);
    expect(r.parties[1].buckets.d90plus).toBe(1000);
    expect(r.totals).toEqual({ notDue: 800, d1_30: 250, d31_60: 0, d61_90: 0, d90plus: 1000 });
    expect(r.total).toBe(2050);
  });

  it("lists what falls due soon and what is overdue", () => {
    expect(dueWithin(aging, "2026-11-25", 7).map((d) => d.id)).toEqual(["3"]);
    expect(dueWithin(aging, "2026-11-24", 7).map((d) => d.id)).toEqual([]);
    expect(overdue(aging, "2026-11-05").map((d) => d.id)).toEqual(["1", "2"]);
  });
});

describe("TDS", () => {
  it("reads the PAN from the PAN field or the GSTIN", () => {
    expect(panOf({ pan: "aaacz1234k" })).toBe("AAACZ1234K");
    expect(panOf({ gstin: "27AAPFZ1234K1Z5" })).toBe("AAPFZ1234K");
    expect(panOf({ pan: "bad", gstin: null })).toBeNull();
  });

  it("treats a PAN with C as 4th character as a company", () => {
    expect(isCompanyDeductee({ pan: "AAACZ1234K" })).toBe(true);
    expect(isCompanyDeductee({ gstin: "29AABCZ1234K1Z5" })).toBe(true);
    expect(isCompanyDeductee({ pan: "ABCPZ1234K" })).toBe(false);
    expect(isCompanyDeductee({})).toBe(false);
  });

  it("picks the company or individual rate", () => {
    const s194c = { rateIndividual: 1, rateCompany: 2 };
    expect(tdsRateFor(s194c, { pan: "AAACZ1234K" })).toBe(2);
    expect(tdsRateFor(s194c, { pan: "ABCPZ1234K" })).toBe(1);
    expect(tdsRateFor(s194c, {})).toBe(1);
  });

  it("charges TDS on the taxable value of what is applied", () => {
    const bill = { subtotal: 10000, total: 11800 };
    expect(taxableShare(11800, bill)).toBe(10000);
    expect(taxableShare(5900, bill)).toBe(5000);
    expect(tdsAmount(10000, 2)).toBe(200);
    expect(tdsAmount(12345, 1)).toBe(123);
    expect(computeTds([{ amount: 11800, bill }, { amount: 5900, bill }], 2)).toEqual({ base: 15000, tds: 300 });
  });
});

describe("posting lines", () => {
  it("posts a receipt with TDS and an advance", () => {
    const lines = receiptPostingLines({ bankGlAccountId: "bank", customerId: "c1", amount: 10000, tds: 200, applied: 8200 });
    expect(lines).toEqual([
      { account: { id: "bank" }, debit: 10000 },
      { account: "TDS_RECEIVABLE", debit: 200, contactId: "c1" },
      { account: "RECEIVABLES", credit: 8200, contactId: "c1" },
      { account: "CUSTOMER_ADVANCES", credit: 2000, contactId: "c1", description: "Customer advance (unapplied)" },
    ]);
    expect(assertBalanced(lines)).toEqual({ debit: 10200, credit: 10200 });
  });

  it("posts a receipt that is all advance", () => {
    const lines = receiptPostingLines({ bankGlAccountId: "bank", customerId: "c1", amount: 5000, tds: 0, applied: 0 });
    expect(lines.map((l) => l.account)).toEqual([{ id: "bank" }, "CUSTOMER_ADVANCES"]);
    assertBalanced(lines);
  });

  const billLines = [
    { glAccountId: null, lineTotal: 10000, taxAmount: 1800 },
    { glAccountId: null, lineTotal: 2000, taxAmount: 240 },
    { glAccountId: "freight", lineTotal: 1000, taxAmount: 50 },
  ];

  it("posts an intra-state bill with input CGST and SGST", () => {
    const lines = purchaseInvoicePostingLines({
      supplierId: "s1", lines: billLines, taxTotal: 2090, total: 15090, itcEligible: true, companyState: "Maharashtra", placeOfSupply: "maharashtra",
    });
    expect(lines).toEqual([
      { account: "PURCHASES", debit: 12000 },
      { account: { id: "freight" }, debit: 1000 },
      { account: "INPUT_CGST", debit: 1045 },
      { account: "INPUT_SGST", debit: 1045 },
      { account: "PAYABLES", credit: 15090, contactId: "s1" },
    ]);
    assertBalanced(lines);
  });

  it("posts an inter-state bill with input IGST", () => {
    const lines = purchaseInvoicePostingLines({
      supplierId: "s1", lines: billLines, taxTotal: 2090, total: 15090, itcEligible: true, companyState: "Maharashtra", placeOfSupply: "Gujarat",
    });
    expect(lines.filter((l) => typeof l.account === "string" && l.account.startsWith("INPUT"))).toEqual([{ account: "INPUT_IGST", debit: 2090 }]);
    assertBalanced(lines);
  });

  it("adds GST to the cost when ITC is not eligible", () => {
    const lines = purchaseInvoicePostingLines({
      supplierId: "s1", lines: billLines, taxTotal: 2090, total: 15090, itcEligible: false, companyState: "Maharashtra", placeOfSupply: "Gujarat",
    });
    expect(lines).toEqual([
      { account: "PURCHASES", debit: 14040 },
      { account: { id: "freight" }, debit: 1050 },
      { account: "PAYABLES", credit: 15090, contactId: "s1" },
    ]);
    assertBalanced(lines);
  });

  it("posts a vendor payment with TDS and an advance", () => {
    const lines = vendorPaymentPostingLines({ bankGlAccountId: "bank", supplierId: "s1", applied: 11800, tds: 200, advance: 1000 });
    expect(lines).toEqual([
      { account: "PAYABLES", debit: 11800, contactId: "s1" },
      { account: "SUPPLIER_ADVANCES", debit: 1000, contactId: "s1", description: "Advance to supplier (unapplied)" },
      { account: { id: "bank" }, credit: 12600 },
      { account: "TDS_PAYABLE", credit: 200, contactId: "s1" },
    ]);
    assertBalanced(lines);
  });
});
