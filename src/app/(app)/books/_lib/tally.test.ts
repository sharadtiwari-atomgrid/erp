import { describe, expect, it } from "vitest";
import { buildSalesVouchersXml, DEFAULT_LEDGERS, escapeXml, tallyDate, toCsv, voucherEntries, type SalesVoucher } from "./tally";

const voucher: SalesVoucher = {
  number: "INV-00001",
  date: new Date("2026-11-02T20:00:00Z"), // 3 Nov 01:30 IST
  partyName: 'Shah & Sons <"Retail">',
  partyGstin: "27AAAAA0000A1Z5",
  partyState: "Maharashtra",
  placeOfSupply: "Maharashtra",
  narration: "Invoice INV-00001",
  taxable: 1000,
  cgst: 90,
  sgst: 90,
  igst: 0,
  total: 1180,
};

describe("escapeXml", () => {
  it("escapes markup characters and drops control characters", () => {
    expect(escapeXml(`a & b < c > d " e ' f\u0001`)).toBe("a &amp; b &lt; c &gt; d &quot; e &apos; f");
  });
});

describe("voucherEntries", () => {
  it("balances the party debit against sales and GST credits", () => {
    const entries = voucherEntries(voucher, DEFAULT_LEDGERS);
    expect(entries.map((e) => e.ledger)).toEqual([voucher.partyName, "Sales", "Output CGST", "Output SGST"]);
    const sum = entries.reduce((s, e) => s + (e.debit ? -e.paise : e.paise), 0);
    expect(sum).toBe(0);
  });

  it("posts any paisa difference to round off", () => {
    const entries = voucherEntries({ ...voucher, total: 1180.01 }, DEFAULT_LEDGERS);
    expect(entries.at(-1)).toMatchObject({ ledger: "Round Off", paise: 1, debit: false });
    const sum = entries.reduce((s, e) => s + (e.debit ? -e.paise : e.paise), 0);
    expect(sum).toBe(0);
  });

  it("uses IGST for inter-state invoices", () => {
    const entries = voucherEntries({ ...voucher, cgst: 0, sgst: 0, igst: 180 }, DEFAULT_LEDGERS);
    expect(entries.map((e) => e.ledger)).toEqual([voucher.partyName, "Sales", "Output IGST"]);
  });
});

describe("buildSalesVouchersXml", () => {
  it("produces an escaped ENVELOPE/IMPORTDATA document", () => {
    const xml = buildSalesVouchersXml("Acme & Co", [voucher]);
    expect(xml).toContain("<TALLYREQUEST>Import Data</TALLYREQUEST>");
    expect(xml).toContain("<REPORTNAME>Vouchers</REPORTNAME>");
    expect(xml).toContain("<SVCURRENTCOMPANY>Acme &amp; Co</SVCURRENTCOMPANY>");
    expect(xml).toContain("<PARTYLEDGERNAME>Shah &amp; Sons &lt;&quot;Retail&quot;&gt;</PARTYLEDGERNAME>");
    expect(xml).toContain("<DATE>20261103</DATE>");
    expect(xml).toContain("<AMOUNT>-1180.00</AMOUNT>");
    expect(xml).toContain("<AMOUNT>1000.00</AMOUNT>");
    expect(xml).not.toContain("Shah & Sons");
  });
});

describe("helpers", () => {
  it("formats Tally dates in IST", () => {
    expect(tallyDate(new Date("2026-11-02T18:29:00Z"))).toBe("20261102");
    expect(tallyDate(new Date("2026-11-02T18:31:00Z"))).toBe("20261103");
  });

  it("quotes CSV cells and neutralises formulas", () => {
    const csv = toCsv(["a", "b"], [['x, "y"', "=SUM(A1)"], [-12.5, null]]);
    expect(csv).toBe('﻿a,b\r\n"x, ""y""",\'=SUM(A1)\r\n-12.5,\r\n');
  });
});
