/**
 * Daily digest → Inventory Report EOD: per material at AG Warehouse (Panoli), the ERP's
 * inward / outward / in stock, the day's movement, and the uploaded warehouse MIS beside it
 * (differences of 1 kg or more flagged). Pure.
 */
import { LOCATIONS, num, r3, withCalc, type InwardEntry } from "./inward";
import { normWarehouse, withOutward, type OutwardEntry } from "./outward";
import { countMatcher, materialOf, stockLines } from "./stock-in-hand";
import { warehouseByMaterial, type WarehouseMisRow } from "./warehouse-mis";

const PANOLI = LOCATIONS[0];
const atPanoli = (loc: unknown) => !String(loc ?? "").trim() || normWarehouse(loc) === PANOLI;

/**
 * Names that are one material in the report (folded: lower case, letters / digits / % . + only).
 * Other "ATM-" items are separate products, so only the listed ones fold.
 */
export const SAME_MATERIAL: Record<string, string> = { atmdispertoxwpm: "dispertoxwpm" };

/** Material name folded for the report: case and spacing ignored, plus the SAME_MATERIAL aliases. */
export function foldMaterial(k: unknown, same: Record<string, string> = SAME_MATERIAL): string {
  const f = String(k ?? "").toLowerCase().replace(/[^a-z0-9%.+]/g, "");
  return same[f] || f;
}

export type Trio = { in: number; out: number; stock: number };
export type InventoryReportRow = {
  material: string;
  crm: Trio;
  day: { in: number; out: number };
  wh: (Trio & { names: string[] }) | null;
  diff: { in: boolean; out: boolean; stock: boolean };
};
export type InventoryReport = {
  rows: InventoryReportRow[];
  totals: { crm: Trio; day: { in: number; out: number }; wh: Trio | null };
  mismatches: number;
};

/**
 * `day` (YYYY-MM-DD) is "today" for the report. `whRows` are the warehouse MIS rows
 * (WarehouseCount kind "warehouse-mis"), or null when none was uploaded.
 */
export function inventoryReport({
  inward = [],
  outward = [],
  whRows = null,
  day,
  sameMaterial = SAME_MATERIAL,
}: {
  inward?: InwardEntry[];
  outward?: OutwardEntry[];
  whRows?: WarehouseMisRow[] | null;
  day: string;
  sameMaterial?: Record<string, string>;
}): InventoryReport {
  const inP = inward.filter((r) => atPanoli(r.location));
  const outP = outward.filter((r) => atPanoli(r.warehouse));
  type Acc = { material: string; spell: Map<string, number>; crm: Trio; day: { in: number; out: number }; wh: (Trio & { names: string[] }) | null };
  const m = new Map<string, Acc>();
  const row = (k: string, kg = 0) => {
    const f = foldMaterial(k, sameMaterial);
    let o = m.get(f);
    if (!o) m.set(f, (o = { material: k, spell: new Map(), crm: { in: 0, out: 0, stock: 0 }, day: { in: 0, out: 0 }, wh: null }));
    o.spell.set(k, (o.spell.get(k) || 0) + kg);
    return o;
  };
  for (const r of withOutward(inP, outP).map((x) => withCalc(x, day))) {
    const net = num(r.netWeight) || 0;
    const o = row(materialOf(r), net || 1e-9);
    const stock = r.instockQty ?? net;
    o.crm.in += net;
    o.crm.stock += stock;
    o.crm.out += net - stock;
    if (r.inwardDate === day) o.day.in += net;
  }
  for (const r of outP) if (r.obDate === day) row(materialOf(r)).day.out += num(r.qty) || 0;
  if (whRows) {
    const wh = warehouseByMaterial(whRows, countMatcher(stockLines(inP, outP, day), inP));
    for (const [k, w] of Object.entries(wh)) {
      const o = row(k);
      const p = o.wh || { in: 0, out: 0, stock: 0, names: [] };
      o.wh = { in: p.in + w.received, out: p.out + w.dispatched, stock: p.stock + w.closing, names: [...new Set([...p.names, ...(w.names || [])])] };
    }
  }
  // shown under the spelling with the most kg received
  for (const o of m.values()) o.material = [...o.spell].sort((a, b) => b[1] - a[1])[0][0];
  const rows: InventoryReportRow[] = [...m.values()]
    .map((o) => {
      const crm = { in: r3(o.crm.in), out: r3(o.crm.out), stock: r3(o.crm.stock) };
      const diff = o.wh
        ? { in: Math.abs(o.wh.in - crm.in) >= 1, out: Math.abs(o.wh.out - crm.out) >= 1, stock: Math.abs(o.wh.stock - crm.stock) >= 1 }
        : { in: false, out: false, stock: false };
      return { material: o.material, wh: o.wh, crm, day: { in: r3(o.day.in), out: r3(o.day.out) }, diff };
    })
    .filter((o) => Math.abs(o.crm.stock) >= 0.5 || (o.wh && Math.abs(o.wh.stock) >= 0.5) || o.day.in || o.day.out || o.diff.stock)
    .sort((a, b) => Math.max(b.crm.stock, b.wh?.stock || 0) - Math.max(a.crm.stock, a.wh?.stock || 0) || a.material.localeCompare(b.material));
  const sum = (f: (o: InventoryReportRow) => number | undefined) => r3(rows.reduce((s, o) => s + (f(o) || 0), 0));
  return {
    rows,
    totals: {
      crm: { in: sum((o) => o.crm.in), out: sum((o) => o.crm.out), stock: sum((o) => o.crm.stock) },
      day: { in: sum((o) => o.day.in), out: sum((o) => o.day.out) },
      wh: whRows ? { in: sum((o) => o.wh?.in), out: sum((o) => o.wh?.out), stock: sum((o) => o.wh?.stock) } : null,
    },
    mismatches: rows.filter((o) => o.diff.in || o.diff.out || o.diff.stock).length,
  };
}
