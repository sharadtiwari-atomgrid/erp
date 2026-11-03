/**
 * Import CSV / Excel for Fresh PO and Long Hold PO. A sheet with a header row
 * (the Fresh PO column names, or the daily "Fresh PO - PIPELINE" sheet's
 * "Job No.", "AG Demand POC", "Quantity (in KGS)", "Blockers and remarks…")
 * becomes Fresh PO rows. Ported from importSheet.js. Pure functions.
 */
import { parseDay, parseNumber } from "@/lib/ops/dates";
import { ALL_FIELDS, DATE_FIELDS, NUMBER_FIELDS, normKey, PASTE_KEY_MAP, PO_FIELDS } from "./fields";

/** At most this many rows are read from one sheet. */
export const IMPORT_MAX_ROWS = 2000;

const EXTRA: Record<string, string> = {
  jobnumber: "requestNo",
  pono: "requestNo",
  agdemandpoc: "demandPoc",
  demandpoc: "demandPoc",
  product: "product",
  material: "product",
  quantityinkgs: "qtyToDispatch",
  quantity: "qtyToDispatch",
  qty: "qtyToDispatch",
  qtykg: "qtyToDispatch",
  poqtykg: "poQty",
  blockersandremarksincaseofdelayed: "notes",
  blockersandremarks: "notes",
  remarks: "notes",
  notes: "notes",
  ratersperkg: "rate",
  rate: "rate",
  totaltaxablevaluers: "totalTaxable",
  hsn: "hsnCode",
};

/** Fields a sheet may fill: every stored field plus Request No. (used only to match). */
const SHEET_FIELDS = new Set(["requestNo", ...PO_FIELDS]);

const LABELS = new Map<string, string>([
  ...ALL_FIELDS.filter((f) => SHEET_FIELDS.has(f.key)).map((f) => [normKey(f.label), f.key] as [string, string]),
  ...Object.entries(PASTE_KEY_MAP),
  ...Object.entries(EXTRA),
]);

export type SheetRow = Record<string, string>;
export type SheetColumn = { header: string; key: string; i: number };
export type ParsedSheet = { sheet: string; rows: SheetRow[]; columns: SheetColumn[]; skipped: string[] };

function cell(v: unknown): string {
  if (v instanceof Date) return parseDay(v);
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

/**
 * sheets = { name: rows of cells } → the first sheet with a header row (a row
 * among the top 12 with at least 3 known labels). Throws when none is found.
 */
export function parseFreshPoSheet(sheets: Record<string, unknown[][]>): ParsedSheet {
  for (const [sheet, aoa] of Object.entries(sheets)) {
    const rowsIn = aoa ?? [];
    const hr = rowsIn.slice(0, 12).findIndex((row) => (row ?? []).filter((c) => LABELS.has(normKey(c))).length >= 3);
    if (hr < 0) continue;
    const head = (rowsIn[hr] ?? []).map(cell);
    const seen = new Set<string>();
    const columns: SheetColumn[] = [];
    head.forEach((h, i) => {
      const key = LABELS.get(normKey(h));
      if (!key || seen.has(key)) return;
      seen.add(key);
      columns.push({ header: h, key, i });
    });
    const skipped = head.filter((h, i) => h && !columns.some((c) => c.i === i));
    const rows: SheetRow[] = [];
    for (const r of rowsIn.slice(hr + 1)) {
      const e: SheetRow = {};
      for (const c of columns) {
        let v = cell(r?.[c.i]);
        if (!v) continue;
        if (DATE_FIELDS.has(c.key)) v = parseDay(v) || v;
        if (NUMBER_FIELDS.has(c.key)) {
          const m = v.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
          v = m ? m[0] : v;
        }
        e[c.key] = v;
      }
      if (e.customer || e.product || e.requestNo) rows.push(e);
    }
    return { sheet, rows, columns, skipped };
  }
  throw new Error("No header row found — the sheet needs columns like “Customer”, “Product Name” and “PO Date”.");
}

type PoLike = { requestNo?: string | number | null; customer?: string | null; product?: string | null; poDate?: string | Date | null };

/**
 * Is this imported row a PO already here? Same customer and product, and the
 * same PO date (or, when the row has no PO date, the same Request No.), so
 * importing a sheet again doesn't add its POs twice whatever numbers it carries.
 */
export function samePo(po: PoLike, row: PoLike): boolean {
  if (!normKey(row.customer) || normKey(po.customer) !== normKey(row.customer) || normKey(po.product) !== normKey(row.product)) return false;
  const d = parseDay(row.poDate);
  if (d) return parseDay(po.poDate) === d;
  const no = String(row.requestNo ?? "").trim();
  return !!no && String(po.requestNo ?? "").trim() === no;
}

/** The stored fields of a sheet row: trimmed, non-blank, at most 2000 characters each. */
export function cleanRow(row: Record<string, unknown>): SheetRow {
  const out: SheetRow = {};
  for (const k of SHEET_FIELDS) {
    const v = String(row[k] ?? "").trim();
    if (v) out[k] = v.slice(0, 2000);
  }
  return out;
}

function same(key: string, a: unknown, b: unknown): boolean {
  if (DATE_FIELDS.has(key)) return (parseDay(a) || String(a ?? "").trim()) === (parseDay(b) || String(b ?? "").trim());
  if (NUMBER_FIELDS.has(key)) {
    const x = parseNumber(a);
    const y = parseNumber(b);
    if (x !== null || y !== null) return x === y;
  }
  return String(a ?? "").trim() === String(b ?? "").trim();
}

/**
 * The fields an imported row would change on an existing PO. Blank cells change
 * nothing, and Request No. is never taken from a sheet.
 */
export function importChanges(current: Record<string, unknown>, row: SheetRow): SheetRow {
  const out: SheetRow = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === "requestNo" || !v) continue;
    if (!same(k, current[k], v)) out[k] = v;
  }
  return out;
}

/** Picks the PO a row updates: the match with the same Request No., else the first match. */
export function matchPo<T extends PoLike>(live: T[], row: SheetRow): T | undefined {
  const hits = live.filter((p) => samePo(p, row));
  return hits.find((p) => String(p.requestNo ?? "") === row.requestNo) ?? hits[0];
}
