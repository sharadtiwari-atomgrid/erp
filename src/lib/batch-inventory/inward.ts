/**
 * Batch inventory → Inward: one line per batch received into an AG warehouse.
 * Columns follow the inventory tracker's "Inward" sheet. Instock Qty and
 * Warehouse Ageing are worked out (Net Weight − Outward Qty; days since the
 * inward date while stock remains). Pure functions, safe on the client.
 */

export const LOCATIONS = ["AG Warehouse (Panoli)", "AG Ballabgarh warehouse"] as const;
export const FUNNELS = ["Domestic B2B", "Import B2B", "Exports", "Domestic", "RnD"] as const;
export const LICENSES = ["Yes", "License Required", "Not Available"] as const;
export const UOMS = ["kg", "Ltr", "DRUMS", "BAGS"] as const;

export type FieldKind = "text" | "date" | "num" | "calc";
export type SheetField<K extends string = string> = { key: K; label: string; short?: string; kind?: FieldKind };

/** One inward line as the pages and the stock maths see it (dates as YYYY-MM-DD, "" when blank). */
export type InwardEntry = {
  id?: string;
  createdAt?: string;
  jobNo: string;
  inwardDate: string;
  location: string;
  funnel: string;
  supplyPoc: string;
  grnNo: string;
  manufacturer: string;
  supplier: string;
  productName: string;
  catalogueName: string;
  type: string;
  hsn: string;
  batchNo: string;
  units: number | null;
  packaging: string;
  uom: string;
  netWeight: number | null;
  grossWeight: number | null;
  mfgDate: string;
  expDate: string;
  purchaseRate: number | null;
  remarks: string;
  /** Outward Qty (the sheet's figure; CRM dispatches are added by withOutward). */
  outwardQty: number | null;
  license: string;
};
export type InwardKey = Exclude<keyof InwardEntry, "id" | "createdAt">;
export type CalcKey = "instockQty" | "ageing";

export const INWARD_FIELDS: SheetField<InwardKey | CalcKey>[] = [
  { key: "jobNo", label: "SCM Job No. (YY-SF-JN)", short: "Job No." },
  { key: "inwardDate", label: "Inward Date", kind: "date" },
  { key: "location", label: "Location" },
  { key: "funnel", label: "Shipment Funnel" },
  { key: "supplyPoc", label: "Supply POC" },
  { key: "grnNo", label: "GRN No.( Unique B,D,G,H)", short: "GRN No." },
  { key: "manufacturer", label: "Manufacturer" },
  { key: "supplier", label: "Supplier" },
  { key: "productName", label: "Product Name" },
  { key: "catalogueName", label: "AG Catalogue Name" },
  { key: "type", label: "Type" },
  { key: "hsn", label: "HSN" },
  { key: "batchNo", label: "Batch Number" },
  { key: "units", label: "Units", kind: "num" },
  { key: "packaging", label: "Packaging" },
  { key: "uom", label: "UOM" },
  { key: "netWeight", label: "Net Weight (kg)", kind: "num" },
  { key: "grossWeight", label: "Gross Weight", kind: "num" },
  { key: "mfgDate", label: "Mfg Date" },
  { key: "expDate", label: "Exp Date" },
  { key: "purchaseRate", label: "Purchase Rate (Per kg)", kind: "num" },
  { key: "remarks", label: "Remarks" },
  { key: "outwardQty", label: "Outward Qty", kind: "num" },
  { key: "instockQty", label: "Instock Qty", kind: "calc" },
  { key: "ageing", label: "Warehouse Ageing", kind: "calc" },
  { key: "license", label: "Stock & Sell License" },
];
export const INWARD_STORED = INWARD_FIELDS.filter((f) => f.kind !== "calc").map((f) => f.key as InwardKey);

export const hk = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const txt = (v: unknown) => (v === null || v === undefined ? "" : String(v).replace(/\r/g, "").trim());
export const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** "1,000.50" → 1000.5; "25 Kgs", "500kg", "₹800" → the number; blank / N/A / "-" / nil → null. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "object" && "toFixed" in (v as object)) return num(Number(String(v))); // Prisma Decimal
  const s = String(v).replace(/,/g, "").replace(/^(₹|rs\.?|inr)\s*/i, "").trim();
  if (!s || /^(n\/?a|-|nil)$/i.test(s)) return null;
  const m = s.match(/^(-?\d+(?:\.\d+)?)\s*(?:kgs?|kilos?|ltrs?|litres?|l)?\.?$/i);
  return m ? Number(m[1]) : null;
}

const pad = (x: number | string) => String(x).padStart(2, "0");
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** dd/mm/yyyy (also d/m/yy, dd-mm-yyyy, yyyy-mm-dd, a Date, an Excel serial or "8-Jun-28") → YYYY-MM-DD, else "". */
export function isoDate(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v === "number") {
    if (v < 30000) return "";
    const d = new Date(Math.round((v - 25569) * 864e5));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m = s.match(/^(\d{1,2})[\s/.-]+([a-z]{3,9})[\s/.,-]+(\d{2}|\d{4})$/i);
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()] && +m[1] >= 1 && +m[1] <= 31)
    return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${pad(MONTHS[m[2].slice(0, 3).toLowerCase()])}-${pad(m[1])}`;
  return "";
}

/**
 * A Mfg / Exp date as written on labels: a full date, or month and year only ("Jun-28",
 * "06/2028", "June 2028") — the end of that month for an expiry, the 1st for a manufacturing date.
 */
export function labelDate(v: unknown, end = true): string {
  const full = isoDate(v);
  if (full) return full;
  const s = String(v ?? "").trim();
  let y: string;
  let mo: number;
  let m = s.match(/^([a-z]{3,9})[\s/.,'-]+(\d{2}|\d{4})$/i);
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) {
    mo = MONTHS[m[1].slice(0, 3).toLowerCase()];
    y = m[2];
  } else if ((m = s.match(/^(\d{1,2})[/.-](\d{4})$/)) && +m[1] >= 1 && +m[1] <= 12) {
    mo = +m[1];
    y = m[2];
  } else return "";
  const yy = y.length === 2 ? 2000 + +y : +y;
  return `${yy}-${pad(mo)}-${pad(end ? new Date(Date.UTC(yy, mo, 0)).getUTCDate() : 1)}`;
}

/** YYYY-MM-DD → dd/mm/yyyy (anything else is shown as it is). */
export const showDate = (iso: string | null | undefined) =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso || "") ? `${iso!.slice(8, 10)}/${iso!.slice(5, 7)}/${iso!.slice(0, 4)}` : iso || "";

/** Job numbers the sheet formats as numbers ("1,033") keep their digits only. */
export const jobOf = (v: unknown) => {
  const s = txt(v);
  return /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s;
};

/** One stored entry from free values (form or sheet row): trims text, reads numbers and the inward date. */
export function cleanInward(v: Record<string, unknown>): InwardEntry {
  const e: Record<string, unknown> = {};
  for (const f of INWARD_FIELDS) {
    if (f.kind === "calc") continue;
    const x = v[f.key];
    // Mfg / Exp stay as written ("Jun-28"), except spreadsheet date cells, which become YYYY-MM-DD.
    const labelCell = (f.key === "mfgDate" || f.key === "expDate") && (typeof x === "number" || x instanceof Date);
    e[f.key] = f.kind === "num" ? num(x) : f.kind === "date" || labelCell ? isoDate(x) : f.key === "jobNo" ? jobOf(x) : txt(x);
  }
  return e as InwardEntry;
}

export type Calculated = { instockQty: number | null; ageing: number | null };

/** Instock Qty and Warehouse Ageing (days since inward, while stock remains), as of `today` (YYYY-MM-DD). */
export function withCalc<T extends { netWeight: unknown; outwardQty?: unknown; inwardDate?: string }>(e: T, today: string): T & Calculated {
  const net = num(e.netWeight);
  const out = num(e.outwardQty) ?? 0;
  const instock = net === null ? null : r3(net - out);
  let ageing: number | null = null;
  if (instock !== null && instock > 0.0005 && e.inwardDate && today) ageing = Math.round((Date.parse(today) - Date.parse(e.inwardDate)) / 864e5);
  return { ...e, instockQty: instock, ageing };
}

export type SheetIssue = { row: number; msg: string };

/** The inward sheet (array of rows, header anywhere in the first 10) → { entries, issues }. `today` flags future dates. */
export function rowsFromSheet(aoa: unknown[][], today?: string): { entries: InwardEntry[]; issues: SheetIssue[] } {
  const hr = aoa.slice(0, 10).findIndex((r) => (r || []).some((c) => hk(c) === "inwarddate") && (r || []).some((c) => hk(c) === "productname"));
  if (hr < 0) throw new Error("No Inward table found — expected a header row with “Inward Date” and “Product Name”.");
  const H = aoa[hr].map(hk);
  const col: Record<string, number> = {};
  for (const f of INWARD_FIELDS) {
    const k = hk(f.label);
    let i = H.indexOf(k);
    if (i < 0) i = H.findIndex((h) => h && (h.startsWith(k.slice(0, 10)) || k.startsWith(h)));
    col[f.key] = i;
  }
  if (col.netWeight < 0) throw new Error("No “Net Weight (kg)” column found.");
  const entries: InwardEntry[] = [];
  const issues: SheetIssue[] = [];
  aoa.slice(hr + 1).forEach((r, j) => {
    if (!r || !r.some((c) => txt(c))) return;
    const raw = Object.fromEntries(Object.entries(col).map(([k, i]) => [k, i >= 0 ? r[i] : null]));
    const e = cleanInward(raw);
    const row = hr + j + 2;
    if (!e.productName && !e.batchNo && e.netWeight === null) return;
    if (!e.inwardDate) issues.push({ row, msg: `Inward date “${txt(raw.inwardDate)}” isn't a date` });
    if (e.netWeight === null) issues.push({ row, msg: `${e.productName} ${e.batchNo}: net weight “${txt(raw.netWeight)}” can't be read — this line adds no stock until it's fixed` });
    else if (today && e.inwardDate > today) issues.push({ row, msg: `${e.productName} ${e.batchNo}: inward date ${showDate(e.inwardDate)} is in the future` });
    const sheetStock = num(raw.instockQty);
    if (sheetStock !== null && e.netWeight !== null && Math.abs(e.netWeight - (e.outwardQty ?? 0) - sheetStock) > 0.01)
      issues.push({
        row,
        msg: `${e.productName} ${e.batchNo}: the sheet's Instock Qty ${sheetStock} ≠ Net ${e.netWeight} − Outward ${e.outwardQty ?? 0}; the ERP shows ${r3(e.netWeight - (e.outwardQty ?? 0))}`,
      });
    entries.push(e);
  });
  return { entries, issues };
}

const keyPart = (x: unknown) => String(x ?? "").trim().toLowerCase();
/** Same receipt line? (to skip rows already in the ERP when adding from the sheet again) */
export const lineKey = (e: Pick<InwardEntry, "jobNo" | "grnNo" | "batchNo" | "productName" | "netWeight" | "inwardDate">) =>
  [e.jobNo, e.grnNo, e.batchNo, e.productName, e.netWeight, e.inwardDate].map(keyPart).join("|");

/** Next GRN No. at a location: the highest numeric GRN there + 1 ("1" when none). */
export function nextGrn(lines: Pick<InwardEntry, "location" | "grnNo">[], location: string): string {
  const n = lines.filter((r) => r.location === location).map((r) => num(r.grnNo)).filter((x): x is number => x !== null);
  return n.length ? String(Math.max(...n) + 1) : "1";
}

/** "AG Warehouse (Panoli)" → "Panoli", "AG Ballabgarh warehouse" → "Ballabgarh". */
export const shortLoc = (l: string | null | undefined) =>
  (String(l ?? "").match(/\(([^)]+)\)/) || [])[1] || String(l ?? "").replace(/^AG\s+/i, "").replace(/\s*warehouse\s*/i, "").trim();
