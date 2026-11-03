/**
 * The warehouse's daily MIS workbook: its "Stock in Hand" tab lists every batch with
 * Qty Received, Qty Dispatched and Closing Stock under a "STOCK COUNT <date>" title.
 * parseWarehouseMis reads that tab; warehouseByMaterial totals it per ERP material. Pure.
 */
import { toDate } from "./engine";
import { hk } from "./inward";

const txt = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const n = (v: unknown) => {
  const m = String(v ?? "").replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : 0;
};
const r3 = (v: number) => Math.round(v * 1000) / 1000;

const COLS = {
  name: ["materialdescription", "productname", "material"],
  batch: ["batchno", "batchnumber", "batch"],
  received: ["qtyreceived", "receivedqty", "inwardqty"],
  dispatched: ["qtydispatched", "dispatchedqty", "outwardqty"],
  closing: ["closingstock", "instockqtykg", "instockqty", "balance"],
} as const;
type Col = keyof typeof COLS;

export type WarehouseMisRow = { name: string; batch: string; received: number; dispatched: number; closing: number };
export type WarehouseMis = { date: string | null; sheet: string; rows: WarehouseMisRow[] };

/** sheets = { name: aoa } → { date, sheet, rows }. Throws if no such tab. */
export function parseWarehouseMis(sheets: Record<string, unknown[][]>): WarehouseMis {
  const isSih = (s: string) => (/stock\s*in\s*hand/i.test(s) ? 1 : 0);
  const order = Object.keys(sheets).sort((a, b) => isSih(b) - isSih(a));
  for (const sheet of order) {
    const aoa = sheets[sheet] || [];
    const hr = aoa.slice(0, 12).findIndex((row) => {
      const h = (row || []).map(hk);
      return COLS.name.some((k) => h.includes(k)) && h.some((x) => (COLS.closing as readonly string[]).includes(x));
    });
    if (hr < 0) continue;
    const h = aoa[hr].map(hk);
    const col = Object.fromEntries(
      (Object.entries(COLS) as [Col, readonly string[]][]).map(([k, keys]) => [k, keys.map((key) => h.indexOf(key)).find((i) => i >= 0) ?? -1]),
    ) as Record<Col, number>;
    const rows: WarehouseMisRow[] = [];
    for (const row of aoa.slice(hr + 1)) {
      const name = txt(row?.[col.name]);
      if (!name || /^total$/i.test(name) || name === "0") continue;
      const get = (k: Col) => (col[k] >= 0 ? n(row[col[k]]) : 0);
      rows.push({ name, batch: col.batch >= 0 ? txt(row[col.batch]) : "", received: get("received"), dispatched: get("dispatched"), closing: get("closing") });
    }
    let date: string | null = null;
    for (const row of aoa.slice(0, hr)) {
      for (const v of row || []) {
        const d = typeof v === "number" ? null : toDate(v);
        if (d && d >= "2000" && d < "2100") {
          date = d;
          break;
        }
      }
      if (date) break;
    }
    return { date, sheet, rows };
  }
  throw new Error("No “Stock in Hand” tab found — expected a header row with “Material Description” and “Closing Stock”.");
}

export type WarehouseTotals = { received: number; dispatched: number; closing: number; names: string[] };

/** Warehouse rows → { material: totals } using a matcher from countMatcher(). Unmatched rows keep their own name. */
export function warehouseByMaterial(rows: WarehouseMisRow[], materialFor: (c: { name: string; batch?: string }) => string | null): Record<string, WarehouseTotals> {
  const acc: Record<string, { received: number; dispatched: number; closing: number; names: Set<string> }> = {};
  for (const r of rows) {
    const m = materialFor({ name: r.name, batch: r.batch }) || r.name;
    const o = (acc[m] ||= { received: 0, dispatched: 0, closing: 0, names: new Set() });
    o.received += r.received;
    o.dispatched += r.dispatched;
    o.closing += r.closing;
    o.names.add(r.name);
  }
  return Object.fromEntries(
    Object.entries(acc).map(([k, o]) => [k, { received: r3(o.received), dispatched: r3(o.dispatched), closing: r3(o.closing), names: [...o.names] }]),
  );
}
