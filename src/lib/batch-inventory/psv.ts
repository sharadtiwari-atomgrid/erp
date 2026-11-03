/**
 * Physical stock verification (PSV) sheet — the warehouse's batch-wise stock count:
 * Product Name | Batch No. | Instock Qty(KG) | PSV Qty | Units | Type of Packaging |
 * Net Weight | Gross Weight | MFG | EXP. The same reader takes the warehouse MIS
 * "Stock in Hand" tab (Material Description / Closing Stock) and the tracker's Instock
 * tab. Pure: works on SheetJS array-of-arrays.
 */
import { norm, toDate } from "./engine";
import { hk, isoDate } from "./inward";

const txt = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const NA = /^(n\/?a|na|nil|-+|—)$/i;
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "" || NA.test(String(v).trim())) return null;
  const m = String(v).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};
const r3 = (v: number) => Math.round(v * 1000) / 1000;
// Batch numbers the sheet stores as numbers (2511007, 1082) keep their digits only.
const batchOf = (v: unknown) => (typeof v === "number" ? String(v) : txt(v));
// The same batch written two ways (letter O vs zero, spaces, dashes).
const looseKey = (b: string) => String(b).toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/O/g, "0");

const COLS = {
  name: ["productname", "materialdescription", "material", "product"],
  batch: ["batchno", "batchnumber", "batch"],
  qty: ["instockqtykg", "instockqty", "stockqtykg", "qtykg", "closingstock", "quantitykg", "quantity"],
  units: ["psvqty", "noofunits", "unitcount", "nos"],
  uom: ["units", "uom", "unit"],
  pack: ["typeofpackaging", "packaging", "packing", "packtype"],
  net: ["netweight", "netwt", "netweightkg"],
  gross: ["grossweight", "grosswt", "grossweightkg"],
  mfg: ["mfg", "mfgdate", "manufacturingdate", "dateofmanufacture"],
  exp: ["exp", "expdate", "expiry", "expirydate", "dateofexpiry"],
} as const;
type Col = keyof typeof COLS;

function colsOf(header: unknown[]): Record<Col, number> {
  const h = header.map(hk);
  const out = {} as Record<Col, number>;
  for (const [k, keys] of Object.entries(COLS) as [Col, readonly string[]][]) {
    let i = -1;
    for (const key of keys) {
      i = h.indexOf(key);
      if (i >= 0) break;
    }
    if (i < 0 && k !== "uom")
      for (const key of keys) {
        i = h.findIndex((x) => x.startsWith(key));
        if (i >= 0) break;
      }
    out[k] = i;
  }
  return out;
}

// A date written above the table: "PSV Date: 15/10/2026", "As on 15-10-2026", or a date cell on its own.
function dateAbove(aoa: unknown[][], upto: number): string | null {
  for (let r = 0; r < upto; r++) {
    const row = aoa[r] || [];
    for (let i = 0; i < row.length; i++) {
      const d = toDate(row[i]) || (typeof row[i] === "string" && /[a-z]{3}/i.test(row[i] as string) ? isoDate(row[i]) : "");
      if (d) return d;
      const m = String(row[i] ?? "").match(/(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{4}-\d{2}-\d{2})/);
      if (m && toDate(m[1])) return toDate(m[1]);
    }
  }
  return null;
}

export type PsvLine = {
  row: number; name: string; batch: string; qty: number | null; units: number | null; uom: string; pack: string;
  net: number | null; gross: number | null; mfg: string | null; exp: string | null;
};
export type PsvIssue = { row: number; product: string; batch: string; msg: string };
export type Psv = { date: string | null; sheet: string; stock: PsvLine[]; issues: PsvIssue[]; total: number };

/** sheets = { name: aoa } → { date, sheet, stock, issues, total }. Throws when no PSV table is found. */
export function parsePSV(sheets: Record<string, unknown[][]>): Psv {
  for (const [sheetName, aoa] of Object.entries(sheets)) {
    const hr = aoa.slice(0, 15).findIndex((row) => {
      const h = (row || []).map(hk);
      return h.some((x) => (COLS.name as readonly string[]).includes(x)) && h.some((x) => x.startsWith("batch"));
    });
    if (hr < 0) continue;
    const c = colsOf(aoa[hr]);
    if (c.qty < 0) throw new Error(`“${sheetName}”: no in-stock quantity column (e.g. “Instock Qty(KG)”) found.`);
    const stock: PsvLine[] = [];
    const issues: PsvIssue[] = [];
    const flag = (s: PsvLine, msg: string) => issues.push({ row: s.row, product: s.name, batch: s.batch, msg });
    for (let r = hr + 1; r < aoa.length; r++) {
      const row = aoa[r] || [];
      const name = txt(row[c.name]);
      if (!name) continue;
      const get = (k: Col) => (c[k] >= 0 ? row[c[k]] : null);
      const rawMfg = get("mfg");
      const rawExp = get("exp");
      const s: PsvLine = {
        row: r + 1, name, batch: batchOf(get("batch")),
        qty: numOrNull(get("qty")), units: numOrNull(get("units")), uom: txt(get("uom")),
        pack: txt(get("pack")), net: numOrNull(get("net")), gross: numOrNull(get("gross")),
        mfg: toDate(rawMfg), exp: toDate(rawExp),
      };
      stock.push(s);
      if (s.qty === null) flag(s, "No in-stock quantity — counted as 0");
      if (s.qty !== null && s.units !== null && s.net !== null && Math.abs(s.qty - s.units * s.net) > 0.01)
        flag(s, `Qty ${s.qty} kg ≠ ${s.units} units × ${s.net} kg (${r3(s.units * s.net)} kg)`);
      if (s.net !== null && s.gross !== null && s.gross < s.net) flag(s, `Gross weight ${s.gross} kg is lighter than net ${s.net} kg`);
      if (!s.pack && s.qty) flag(s, "Type of packaging is blank");
      if (!s.batch || NA.test(s.batch) || /^no\s*batch|material$/i.test(s.batch)) flag(s, "No batch number");
      for (const [k, raw, d] of [["MFG", rawMfg, s.mfg], ["EXP", rawExp, s.exp]] as const)
        if (!d && raw !== null && raw !== undefined && raw !== "" && !NA.test(String(raw).trim())) flag(s, `${k} “${String(raw)}” isn't a date`);
      if (s.mfg && s.exp && s.exp <= s.mfg) flag(s, `EXP ${s.exp} is on or before MFG ${s.mfg}`);
    }
    // The same batch written two ways (ACLM0826A007 / ACLMO826A007) — often one batch counted twice.
    const seen = new Map<string, PsvLine>();
    for (const s of stock) {
      if (!s.batch) continue;
      const k = norm(s.name) + "|" + looseKey(s.batch);
      const first = seen.get(k);
      if (first && first.batch !== s.batch) flag(s, `Batch also written “${first.batch}” (row ${first.row}) — check it isn't counted twice`);
      else if (!first) seen.set(k, s);
    }
    const date = dateAbove(aoa, hr);
    return { date, sheet: sheetName, stock, issues, total: r3(stock.reduce((a, s) => a + (s.qty || 0), 0)) };
  }
  throw new Error("No PSV table found — expected a header row with “Product Name” and “Batch No.”.");
}

/** One-line description of a parsed PSV. */
export function describePSV(data: Psv) {
  const products = new Set(data.stock.map((s) => norm(s.name))).size;
  return {
    date: data.date,
    info: `PSV ${data.date || "date not set"} · ${data.stock.length} batch lines · ${products} materials · ${Math.round(data.total).toLocaleString("en-IN")} kg${data.issues.length ? ` · ${data.issues.length} to check` : ""}`,
    counts: { stock: data.stock.length, products, issues: data.issues.length },
  };
}
