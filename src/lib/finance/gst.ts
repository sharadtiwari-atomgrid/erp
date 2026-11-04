import { money } from "./chart";

/**
 * Pure GST return builders (GSTR-1 and GSTR-3B) from issued sales invoices and
 * posted purchase invoices. Figures are for review: the ERP does not file
 * returns with the GSTN. Safe to import on the client.
 */

/** B2C invoices above this value, inter-state, to unregistered buyers are B2C (large). */
export const B2CL_THRESHOLD = 250000;

/** GST state codes (first two digits of a GSTIN), keyed by lower-case state name. */
export const GST_STATE_CODES: Record<string, string> = {
  "jammu and kashmir": "01", "jammu & kashmir": "01", "himachal pradesh": "02", punjab: "03", chandigarh: "04", uttarakhand: "05",
  haryana: "06", delhi: "07", rajasthan: "08", "uttar pradesh": "09", bihar: "10", sikkim: "11", "arunachal pradesh": "12",
  nagaland: "13", manipur: "14", mizoram: "15", tripura: "16", meghalaya: "17", assam: "18", "west bengal": "19",
  jharkhand: "20", odisha: "21", orissa: "21", chhattisgarh: "22", "madhya pradesh": "23", gujarat: "24",
  "dadra and nagar haveli and daman and diu": "26", "daman and diu": "26", "dadra and nagar haveli": "26", maharashtra: "27",
  karnataka: "29", goa: "30", lakshadweep: "31", kerala: "32", "tamil nadu": "33", puducherry: "34", pondicherry: "34",
  "andaman and nicobar islands": "35", telangana: "36", "andhra pradesh": "37", ladakh: "38", "other territory": "97",
};

/** "Maharashtra" / "27" / "27-Maharashtra" → "27"; "" when unknown. */
export function stateCode(state: string | null | undefined): string {
  if (!state) return "";
  const s = state.trim();
  const m = s.match(/^(\d{2})\b/);
  if (m) return m[1];
  return GST_STATE_CODES[s.toLowerCase().replace(/\s+/g, " ")] ?? "";
}

/** Unit of measure → GST unit quantity code (UQC). */
export function uqcOf(unit: string | null | undefined): string {
  const u = (unit ?? "").trim().toLowerCase().replace(/\.$/, "");
  const map: Record<string, string> = {
    pcs: "PCS", pc: "PCS", piece: "PCS", pieces: "PCS", nos: "NOS", no: "NOS", number: "NOS", unit: "UNT", units: "UNT",
    kg: "KGS", kgs: "KGS", kilogram: "KGS", g: "GMS", gm: "GMS", gms: "GMS", gram: "GMS", mg: "OTH", ton: "TON", tonne: "MTS", mt: "MTS",
    l: "LTR", lt: "LTR", ltr: "LTR", litre: "LTR", liter: "LTR", ml: "MLT", kl: "KLR", m: "MTR", mtr: "MTR", metre: "MTR",
    box: "BOX", boxes: "BOX", bag: "BAG", bags: "BAG", btl: "BTL", bottle: "BTL", can: "CAN", drum: "DRM", drums: "DRM",
    set: "SET", sets: "SET", pack: "PAC", pkt: "PAC", packet: "PAC", roll: "ROL", dozen: "DOZ", doz: "DOZ", pair: "PRS",
    sqm: "SQM", sqft: "SQF", hrs: "OTH", hour: "OTH",
  };
  return map[u] ?? "OTH";
}

export type TaxSplit = { igst: number; cgst: number; sgst: number };
const zeroTax = (): TaxSplit => ({ igst: 0, cgst: 0, sgst: 0 });

/** Same rule as the ledger posting (splitGst): inter-state when both states are known and differ. */
export function isInterState(companyState: string | null | undefined, placeOfSupply: string | null | undefined): boolean {
  const a = stateCode(companyState) || (companyState ?? "").trim().toLowerCase();
  const b = stateCode(placeOfSupply) || (placeOfSupply ?? "").trim().toLowerCase();
  return !!a && !!b && a !== b;
}

export function splitTax(tax: number, interState: boolean): TaxSplit {
  if (interState) return { igst: money(tax), cgst: 0, sgst: 0 };
  const half = money(tax / 2);
  return { igst: 0, cgst: half, sgst: money(tax - half) };
}

// ── Inputs ──────────────────────────────────────────────────────────────────

export type GstSalesLine = {
  hsn: string | null;
  description: string | null;
  unit: string | null;
  quantity: number;
  taxable: number;
  rate: number;
  tax: number;
};

export type GstSalesInvoice = {
  id: string;
  number: string;
  date: string; // YYYY-MM-DD
  /** ISSUED | PARTIALLY_PAID | PAID | CANCELLED | DRAFT */
  status: string;
  customerName: string;
  customerGstin: string | null;
  customerState: string | null;
  placeOfSupply: string | null;
  total: number;
  lines: GstSalesLine[];
};

export type GstPurchaseInvoice = {
  id: string;
  number: string;
  supplierInvoiceNo: string | null;
  date: string;
  status: string;
  supplierName: string;
  supplierGstin: string | null;
  placeOfSupply: string | null;
  supplierState: string | null;
  itcEligible: boolean;
  taxable: number;
  tax: number;
  total: number;
};

const LIVE_SALES = new Set(["ISSUED", "PARTIALLY_PAID", "PAID"]);
const LIVE_PURCHASES = new Set(["POSTED", "PARTIALLY_PAID", "PAID"]);

// ── GSTR-1 ──────────────────────────────────────────────────────────────────

export type RateItem = { rate: number; taxable: number } & TaxSplit;

export type B2bRow = {
  id: string;
  gstin: string;
  customerName: string;
  number: string;
  date: string;
  value: number;
  placeOfSupply: string;
  posCode: string;
  interState: boolean;
  taxable: number;
  items: RateItem[];
} & TaxSplit;

export type B2clRow = Omit<B2bRow, "gstin">;

export type B2csRow = { placeOfSupply: string; posCode: string; interState: boolean; rate: number; taxable: number } & TaxSplit;

export type HsnRow = { hsn: string; description: string; uqc: string; quantity: number; rate: number; value: number; taxable: number } & TaxSplit;

export type DocSeries = { series: string; from: string; to: string; total: number; cancelled: number; net: number };

export type Gstr1 = {
  period: string;
  b2b: B2bRow[];
  b2cl: B2clRow[];
  b2cs: B2csRow[];
  hsn: HsnRow[];
  docs: DocSeries[];
  totals: { invoices: number; value: number; taxable: number; nilRated: number } & TaxSplit;
};

function add<T extends TaxSplit & { taxable: number }>(target: T, src: TaxSplit & { taxable: number }) {
  target.taxable = money(target.taxable + src.taxable);
  target.igst = money(target.igst + src.igst);
  target.cgst = money(target.cgst + src.cgst);
  target.sgst = money(target.sgst + src.sgst);
}

/** Invoice-number series: the text before the trailing digits ("INV-2026-00042" → "INV-2026-"). */
function seriesOf(number: string): { prefix: string; seq: number } {
  const m = number.match(/^(.*?)(\d+)$/);
  return m ? { prefix: m[1], seq: Number(m[2]) } : { prefix: number, seq: 0 };
}

/** `YYYY-MM` of an ISO date. */
export const periodOf = (iso: string) => iso.slice(0, 7);

/**
 * GSTR-1 for one month from sales invoices. Only issued (not draft or
 * cancelled) invoices dated in the month are reported; cancelled ones are
 * counted in the document summary.
 */
export function buildGstr1(
  period: string,
  invoices: GstSalesInvoice[],
  opts: { companyState: string | null; b2clThreshold?: number },
): Gstr1 {
  const threshold = opts.b2clThreshold ?? B2CL_THRESHOLD;
  const inMonth = invoices.filter((i) => periodOf(i.date) === period && i.status !== "DRAFT");
  const live = inMonth.filter((i) => LIVE_SALES.has(i.status)).sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));

  const b2b: B2bRow[] = [];
  const b2cl: B2clRow[] = [];
  const b2cs = new Map<string, B2csRow>();
  const hsn = new Map<string, HsnRow>();
  const totals = { invoices: 0, value: 0, taxable: 0, nilRated: 0, ...zeroTax() };

  for (const inv of live) {
    const pos = inv.placeOfSupply || inv.customerState || opts.companyState || "";
    const interState = isInterState(opts.companyState, inv.placeOfSupply);
    const items = new Map<number, RateItem>();
    for (const l of inv.lines) {
      const split = splitTax(l.tax, interState);
      const item = items.get(l.rate) ?? { rate: l.rate, taxable: 0, ...zeroTax() };
      add(item, { taxable: l.taxable, ...split });
      items.set(l.rate, item);

      const code = (l.hsn ?? "").trim() || "NA";
      const uqc = uqcOf(l.unit);
      const hk = `${code}|${uqc}|${l.rate}`;
      const h = hsn.get(hk) ?? { hsn: code, description: l.description ?? "", uqc, quantity: 0, rate: l.rate, value: 0, taxable: 0, ...zeroTax() };
      add(h, { taxable: l.taxable, ...split });
      h.quantity = Math.round((h.quantity + l.quantity) * 1000) / 1000;
      h.value = money(h.value + l.taxable + l.tax);
      if (!h.description && l.description) h.description = l.description;
      hsn.set(hk, h);
      if (l.rate === 0) totals.nilRated = money(totals.nilRated + l.taxable);
    }
    const rateItems = [...items.values()].sort((a, b) => a.rate - b.rate);
    const sums = rateItems.reduce((s, r) => (add(s, r), s), { taxable: 0, ...zeroTax() });
    const base = {
      id: inv.id,
      customerName: inv.customerName,
      number: inv.number,
      date: inv.date,
      value: money(inv.total),
      placeOfSupply: pos,
      posCode: stateCode(pos),
      interState,
      items: rateItems,
      ...sums,
    };
    totals.invoices += 1;
    totals.value = money(totals.value + inv.total);
    add(totals, sums);

    const gstin = (inv.customerGstin ?? "").trim().toUpperCase();
    if (gstin) b2b.push({ ...base, gstin });
    else if (interState && inv.total > threshold) b2cl.push(base);
    else {
      for (const r of rateItems) {
        const key = `${base.posCode || pos}|${r.rate}|${interState}`;
        const row = b2cs.get(key) ?? { placeOfSupply: pos, posCode: base.posCode, interState, rate: r.rate, taxable: 0, ...zeroTax() };
        add(row, r);
        b2cs.set(key, row);
      }
    }
  }

  // Document summary: every invoice number used in the month (issued or cancelled), by series.
  const series = new Map<string, { nums: Array<{ number: string; seq: number }>; cancelled: number }>();
  for (const inv of inMonth) {
    const { prefix, seq } = seriesOf(inv.number);
    const s = series.get(prefix) ?? { nums: [], cancelled: 0 };
    s.nums.push({ number: inv.number, seq });
    if (inv.status === "CANCELLED") s.cancelled += 1;
    series.set(prefix, s);
  }
  const docs: DocSeries[] = [...series.entries()]
    .map(([prefix, s]) => {
      const sorted = s.nums.sort((a, b) => a.seq - b.seq || a.number.localeCompare(b.number));
      return { series: prefix, from: sorted[0].number, to: sorted.at(-1)!.number, total: sorted.length, cancelled: s.cancelled, net: sorted.length - s.cancelled };
    })
    .sort((a, b) => a.series.localeCompare(b.series));

  return {
    period,
    b2b,
    b2cl,
    b2cs: [...b2cs.values()].sort((a, b) => a.placeOfSupply.localeCompare(b.placeOfSupply) || a.rate - b.rate),
    hsn: [...hsn.values()].sort((a, b) => a.hsn.localeCompare(b.hsn) || a.rate - b.rate),
    docs,
    totals,
  };
}

// ── GSTR-3B ─────────────────────────────────────────────────────────────────

export type ItcRow = {
  id: string;
  number: string;
  supplierInvoiceNo: string | null;
  supplierName: string;
  supplierGstin: string | null;
  date: string;
  taxable: number;
} & TaxSplit;

export type SetOff = {
  /** Output tax liability per head. */
  liability: TaxSplit;
  /** ITC available per head. */
  credit: TaxSplit;
  /** credit used: utilised[from][against] */
  utilised: { igst: TaxSplit; cgst: TaxSplit; sgst: TaxSplit };
  /** Tax still payable in cash per head. */
  cash: TaxSplit;
  /** Credit left to carry forward per head. */
  carryForward: TaxSplit;
};

export type Gstr3b = {
  period: string;
  /** 3.1(a) outward taxable supplies (other than nil rated). */
  outward: { taxable: number } & TaxSplit;
  /** 3.1(c) nil-rated supplies. */
  nilRated: number;
  /** 4(A)(5) all other ITC, from eligible purchase invoices. */
  itc: TaxSplit;
  /** 4(D) ineligible ITC (bills marked not eligible). */
  ineligible: TaxSplit;
  itcRows: ItcRow[];
  setOff: SetOff;
  /** Net payable in cash (sum of heads). */
  netPayable: number;
};

/**
 * Sets off ITC against output tax in the statutory order: IGST credit first
 * against IGST, then CGST, then SGST; CGST credit against CGST, then IGST;
 * SGST credit against SGST, then IGST. CGST and SGST never cross.
 */
export function setOffItc(liability: TaxSplit, credit: TaxSplit): SetOff {
  const due = { ...liability };
  const left = { ...credit };
  const utilised = { igst: zeroTax(), cgst: zeroTax(), sgst: zeroTax() };
  const apply = (from: keyof TaxSplit, against: keyof TaxSplit) => {
    const amt = money(Math.max(0, Math.min(left[from], due[against])));
    if (amt <= 0) return;
    left[from] = money(left[from] - amt);
    due[against] = money(due[against] - amt);
    utilised[from][against] = money(utilised[from][against] + amt);
  };
  apply("igst", "igst");
  apply("igst", "cgst");
  apply("igst", "sgst");
  apply("cgst", "cgst");
  apply("cgst", "igst");
  apply("sgst", "sgst");
  apply("sgst", "igst");
  return { liability: { ...liability }, credit: { ...credit }, utilised, cash: due, carryForward: left };
}

/** GSTR-3B summary for one month from the GSTR-1 figures and posted purchase invoices. */
export function buildGstr3b(gstr1: Gstr1, purchases: GstPurchaseInvoice[], opts: { companyState: string | null }): Gstr3b {
  const outward = { taxable: money(gstr1.totals.taxable - gstr1.totals.nilRated), igst: gstr1.totals.igst, cgst: gstr1.totals.cgst, sgst: gstr1.totals.sgst };
  const itc = zeroTax();
  const ineligible = zeroTax();
  const itcRows: ItcRow[] = [];
  for (const p of purchases
    .filter((p) => periodOf(p.date) === gstr1.period && LIVE_PURCHASES.has(p.status))
    .sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number))) {
    const split = splitTax(p.tax, isInterState(opts.companyState, p.placeOfSupply || p.supplierState));
    const target = p.itcEligible ? itc : ineligible;
    target.igst = money(target.igst + split.igst);
    target.cgst = money(target.cgst + split.cgst);
    target.sgst = money(target.sgst + split.sgst);
    if (p.itcEligible) {
      itcRows.push({
        id: p.id,
        number: p.number,
        supplierInvoiceNo: p.supplierInvoiceNo,
        supplierName: p.supplierName,
        supplierGstin: p.supplierGstin,
        date: p.date,
        taxable: money(p.taxable),
        ...split,
      });
    }
  }
  const setOff = setOffItc({ igst: outward.igst, cgst: outward.cgst, sgst: outward.sgst }, itc);
  return {
    period: gstr1.period,
    outward,
    nilRated: gstr1.totals.nilRated,
    itc,
    ineligible,
    itcRows,
    setOff,
    netPayable: money(setOff.cash.igst + setOff.cash.cgst + setOff.cash.sgst),
  };
}

// ── GSTR-1 JSON (offline tool format, best effort) ──────────────────────────

const dmyDash = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
const itms = (items: RateItem[]) =>
  items.map((r, i) => ({
    num: i + 1,
    itm_det: { txval: r.taxable, rt: r.rate, iamt: r.igst, camt: r.cgst, samt: r.sgst, csamt: 0 },
  }));

/**
 * GSTR-1 shaped like the GST portal's offline tool JSON. For review and upload
 * through the offline tool; the ERP does not file returns itself.
 */
export function gstr1Json(gstr1: Gstr1, gstin: string | null) {
  const [y, m] = gstr1.period.split("-");
  const b2b = new Map<string, { ctin: string; inv: unknown[] }>();
  for (const r of gstr1.b2b) {
    const entry = b2b.get(r.gstin) ?? { ctin: r.gstin, inv: [] };
    entry.inv.push({ inum: r.number, idt: dmyDash(r.date), val: r.value, pos: r.posCode, rchrg: "N", inv_typ: "R", itms: itms(r.items) });
    b2b.set(r.gstin, entry);
  }
  const b2cl = new Map<string, { pos: string; inv: unknown[] }>();
  for (const r of gstr1.b2cl) {
    const entry = b2cl.get(r.posCode) ?? { pos: r.posCode, inv: [] };
    entry.inv.push({ inum: r.number, idt: dmyDash(r.date), val: r.value, itms: itms(r.items) });
    b2cl.set(r.posCode, entry);
  }
  return {
    gstin: gstin ?? "",
    fp: `${m}${y}`,
    version: "GST3.1.6",
    hash: "hash",
    b2b: [...b2b.values()],
    b2cl: [...b2cl.values()],
    b2cs: gstr1.b2cs.map((r) => ({
      sply_ty: r.interState ? "INTER" : "INTRA",
      pos: r.posCode,
      typ: "OE",
      rt: r.rate,
      txval: r.taxable,
      iamt: r.igst,
      camt: r.cgst,
      samt: r.sgst,
      csamt: 0,
    })),
    hsn: {
      data: gstr1.hsn.map((h, i) => ({
        num: i + 1,
        hsn_sc: h.hsn,
        desc: h.description.slice(0, 30),
        uqc: h.uqc,
        qty: h.quantity,
        rt: h.rate,
        txval: h.taxable,
        iamt: h.igst,
        camt: h.cgst,
        samt: h.sgst,
        csamt: 0,
      })),
    },
    doc_issue: {
      doc_det: [
        {
          doc_num: 1,
          doc_typ: "Invoices for outward supply",
          docs: gstr1.docs.map((d, i) => ({ num: i + 1, from: d.from, to: d.to, totnum: d.total, cancel: d.cancelled, net_issue: d.net })),
        },
      ],
    },
  };
}

/** Months as YYYY-MM, newest first, for a picker. */
export function recentPeriods(todayIso: string, count = 18): string[] {
  let [y, m] = todayIso.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

/** First and last day of a YYYY-MM period. */
export function periodRange(period: string): { from: string; to: string } {
  const [y, m] = period.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, "0")}` };
}

export function isPeriod(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
