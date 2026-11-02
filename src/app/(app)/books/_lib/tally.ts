/**
 * Tally-compatible XML (ENVELOPE / IMPORTDATA) and CSV builders. Pure
 * functions: the route handlers load data and call these.
 *
 * Tally sign convention for ledger entries: debits are negative amounts with
 * ISDEEMEDPOSITIVE=Yes, credits are positive with ISDEEMEDPOSITIVE=No. Every
 * voucher must sum to zero.
 */

export type TallyLedgerNames = {
  sales: string;
  cgst: string;
  sgst: string;
  igst: string;
  roundOff: string;
};

export const DEFAULT_LEDGERS: TallyLedgerNames = {
  sales: "Sales",
  cgst: "Output CGST",
  sgst: "Output SGST",
  igst: "Output IGST",
  roundOff: "Round Off",
};

export type SalesVoucher = {
  number: string;
  date: Date;
  partyName: string;
  partyGstin: string | null;
  partyState: string | null;
  placeOfSupply: string | null;
  narration: string;
  /** Rupee amounts as stored on the invoice. */
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
};

export function escapeXml(value: string): string {
  return (
    value
      // Characters that are illegal in XML 1.0 (control chars other than tab/newline/CR).
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
  );
}

const paise = (rupees: number) => Math.round(rupees * 100);
const fmt = (p: number) => (p / 100).toFixed(2);

/** YYYYMMDD in IST, the date format Tally expects. */
export function tallyDate(date: Date): string {
  const ist = new Date(date.getTime() + 330 * 60 * 1000);
  return ist.toISOString().slice(0, 10).replace(/-/g, "");
}

type Entry = { ledger: string; paise: number; debit: boolean; party?: boolean };

/** Ledger entries for one invoice, balanced to the paisa (any difference goes to Round Off). */
export function voucherEntries(v: SalesVoucher, ledgers: TallyLedgerNames): Entry[] {
  const total = paise(v.total);
  const credits: Entry[] = [
    { ledger: ledgers.sales, paise: paise(v.taxable), debit: false },
    { ledger: ledgers.cgst, paise: paise(v.cgst), debit: false },
    { ledger: ledgers.sgst, paise: paise(v.sgst), debit: false },
    { ledger: ledgers.igst, paise: paise(v.igst), debit: false },
  ].filter((e) => e.paise !== 0);
  const credited = credits.reduce((s, e) => s + e.paise, 0);
  const diff = total - credited;
  if (diff !== 0) credits.push({ ledger: ledgers.roundOff, paise: Math.abs(diff), debit: diff < 0 });
  return [{ ledger: v.partyName, paise: total, debit: true, party: true }, ...credits];
}

/** Signed Tally amount: debit negative, credit positive. */
const signed = (e: Entry) => (e.debit ? -e.paise : e.paise);

function entryXml(e: Entry): string {
  return [
    "        <LEDGERENTRIES.LIST>",
    `          <LEDGERNAME>${escapeXml(e.ledger)}</LEDGERNAME>`,
    `          <ISDEEMEDPOSITIVE>${e.debit ? "Yes" : "No"}</ISDEEMEDPOSITIVE>`,
    `          <ISPARTYLEDGER>${e.party ? "Yes" : "No"}</ISPARTYLEDGER>`,
    `          <AMOUNT>${fmt(signed(e))}</AMOUNT>`,
    "        </LEDGERENTRIES.LIST>",
  ].join("\n");
}

function voucherXml(v: SalesVoucher, ledgers: TallyLedgerNames): string {
  const date = tallyDate(v.date);
  const tags = [
    `        <DATE>${date}</DATE>`,
    `        <EFFECTIVEDATE>${date}</EFFECTIVEDATE>`,
    "        <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>",
    `        <VOUCHERNUMBER>${escapeXml(v.number)}</VOUCHERNUMBER>`,
    `        <REFERENCE>${escapeXml(v.number)}</REFERENCE>`,
    `        <PARTYLEDGERNAME>${escapeXml(v.partyName)}</PARTYLEDGERNAME>`,
    `        <PARTYNAME>${escapeXml(v.partyName)}</PARTYNAME>`,
    v.partyGstin ? `        <PARTYGSTIN>${escapeXml(v.partyGstin)}</PARTYGSTIN>` : null,
    v.partyState ? `        <STATENAME>${escapeXml(v.partyState)}</STATENAME>` : null,
    v.placeOfSupply ? `        <PLACEOFSUPPLY>${escapeXml(v.placeOfSupply)}</PLACEOFSUPPLY>` : null,
    `        <NARRATION>${escapeXml(v.narration)}</NARRATION>`,
    "        <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>",
    ...voucherEntries(v, ledgers).map(entryXml),
  ].filter(Boolean);
  return [
    '    <TALLYMESSAGE xmlns:UDF="TallyUDF">',
    '      <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Accounting Voucher View">',
    ...tags,
    "      </VOUCHER>",
    "    </TALLYMESSAGE>",
  ].join("\n");
}

function envelope(reportName: string, companyName: string, messages: string[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<ENVELOPE>",
    "  <HEADER>",
    "    <TALLYREQUEST>Import Data</TALLYREQUEST>",
    "  </HEADER>",
    "  <BODY>",
    "    <IMPORTDATA>",
    "      <REQUESTDESC>",
    `        <REPORTNAME>${reportName}</REPORTNAME>`,
    "        <STATICVARIABLES>",
    `          <SVCURRENTCOMPANY>${escapeXml(companyName)}</SVCURRENTCOMPANY>`,
    "        </STATICVARIABLES>",
    "      </REQUESTDESC>",
    "      <REQUESTDATA>",
    ...messages,
    "      </REQUESTDATA>",
    "    </IMPORTDATA>",
    "  </BODY>",
    "</ENVELOPE>",
    "",
  ].join("\n");
}

/** Sales vouchers for Tally's "Import Data" (Gateway of Tally → Import → Vouchers). */
export function buildSalesVouchersXml(companyName: string, vouchers: SalesVoucher[], ledgers: TallyLedgerNames = DEFAULT_LEDGERS) {
  return envelope("Vouchers", companyName, vouchers.map((v) => voucherXml(v, ledgers)));
}

export type PartyMaster = { name: string; gstin: string | null; state: string | null; address: string | null };

/**
 * Ledger masters to import before the vouchers: one Sundry Debtors ledger per
 * customer plus the sales, GST and round-off ledgers. ACTION="Create" leaves
 * ledgers that already exist untouched.
 */
export function buildLedgerMastersXml(companyName: string, parties: PartyMaster[], ledgers: TallyLedgerNames = DEFAULT_LEDGERS) {
  const ledger = (name: string, parent: string, extra: Array<string | null> = []) =>
    [
      '    <TALLYMESSAGE xmlns:UDF="TallyUDF">',
      `      <LEDGER NAME="${escapeXml(name)}" ACTION="Create">`,
      `        <NAME>${escapeXml(name)}</NAME>`,
      `        <PARENT>${escapeXml(parent)}</PARENT>`,
      ...extra.filter(Boolean),
      "      </LEDGER>",
      "    </TALLYMESSAGE>",
    ].join("\n");
  const tax = (name: string, head: string) =>
    ledger(name, "Duties & Taxes", ["        <TAXTYPE>GST</TAXTYPE>", `        <GSTDUTYHEAD>${head}</GSTDUTYHEAD>`]);
  return envelope("All Masters", companyName, [
    ledger(ledgers.sales, "Sales Accounts"),
    tax(ledgers.cgst, "Central Tax"),
    tax(ledgers.sgst, "State Tax"),
    tax(ledgers.igst, "Integrated Tax"),
    ledger(ledgers.roundOff, "Indirect Expenses"),
    ...parties.map((p) =>
      ledger(p.name, "Sundry Debtors", [
        "        <ISBILLWISEON>Yes</ISBILLWISEON>",
        p.gstin ? `        <PARTYGSTIN>${escapeXml(p.gstin)}</PARTYGSTIN>` : null,
        p.gstin ? "        <GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>" : "        <GSTREGISTRATIONTYPE>Unregistered</GSTREGISTRATIONTYPE>",
        p.state ? `        <LEDSTATENAME>${escapeXml(p.state)}</LEDSTATENAME>` : null,
        p.address ? `        <ADDRESS.LIST TYPE="String"><ADDRESS>${escapeXml(p.address)}</ADDRESS></ADDRESS.LIST>` : null,
      ]),
    ),
  ]);
}

/** RFC 4180 CSV with a UTF-8 BOM so Excel opens rupee symbols and names correctly. */
export function toCsv(header: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Prefix values Excel would treat as formulas.
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
