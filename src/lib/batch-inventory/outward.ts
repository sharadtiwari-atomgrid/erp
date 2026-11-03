/**
 * Batch inventory → Outward: one line per batch dispatched from an AG warehouse.
 * Columns follow the inventory tracker's "Outward" sheet. Each line has a source:
 * "sheet" (imported — already counted in the Inward sheet's Outward Qty) or "crm"
 * (entered in the ERP — taken off its batch's inward lines, see allocate). Pure.
 */
import { LOCATIONS, hk, isoDate, jobOf, num, r3, showDate, type InwardEntry, type SheetField, type SheetIssue } from "./inward";

export const OUT_FUNNELS = ["Domestic", "Export"] as const;
export type OutwardSource = "sheet" | "crm";

export type OutwardEntry = {
  id?: string;
  createdAt?: string;
  source?: OutwardSource | string;
  jobNo: string;
  obDate: string;
  warehouse: string;
  funnel: string;
  customer: string;
  grnNo: string;
  productName: string;
  catalogueName: string;
  batchNo: string;
  qty: number | null;
  saleRate: number | null;
};
export type OutwardKey = Exclude<keyof OutwardEntry, "id" | "createdAt" | "source">;

export const OUTWARD_FIELDS: SheetField<OutwardKey>[] = [
  { key: "jobNo", label: "SCM Job No. (YY-SF-JN)", short: "Job No." },
  { key: "obDate", label: "OB Date", kind: "date" },
  { key: "warehouse", label: "Warehouse" },
  { key: "funnel", label: "Shipment Funnel" },
  { key: "customer", label: "Customer" },
  { key: "grnNo", label: "GRN No." },
  { key: "productName", label: "Product Name" },
  { key: "catalogueName", label: "AG Catalogue Name" },
  { key: "batchNo", label: "Batch No." },
  { key: "qty", label: "Qty", kind: "num" },
  { key: "saleRate", label: "Sale Rate", kind: "num" },
];

const txt = (v: unknown) => (v === null || v === undefined ? "" : String(v).replace(/\r/g, "").replace(/\t/g, " ").trim());

/** Batch number for matching: letters and digits only ("TMB/MG/226/100226" = "TMBMG226100226"). */
export const batchKey = (b: unknown) => String(b ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
/** "N.A", "NIL", "-", "No batch" — not a real batch number, so it can't pick out an inward line. */
export const isPlaceholderBatch = (b: unknown) => /^(|NA|NIL|NONE|NOBATCH|0+)$/.test(batchKey(b));
/**
 * Batch numbers as typed by different people: letters and digits only, letter O read as zero,
 * leading zeros dropped ("ACLMO826A009" = "ACLM0826A009", "CCO-09/397" = "CCO-9/397").
 */
export const looseBatch = (b: unknown) =>
  String(b ?? "").toUpperCase().replace(/O/g, "0").split(/[^A-Z0-9]+/).map((t) => t.replace(/^0+(?=\d)/, "")).join("");
const nk = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const matKey = (r: { catalogueName?: string; productName?: string }) => nk(r.catalogueName || r.productName);

/** The sheet spells the warehouse many ways ("AG warehose (Panoli)", "Ag Warehouse (Panoli) "). */
export function normWarehouse(v: unknown): string {
  const s = txt(v);
  if (/panoli/i.test(s)) return LOCATIONS[0];
  if (/ballabgarh/i.test(s)) return LOCATIONS[1];
  return s;
}

export function cleanOutward(v: Record<string, unknown>): OutwardEntry {
  const e: Record<string, unknown> = {};
  for (const f of OUTWARD_FIELDS) {
    const x = v[f.key];
    e[f.key] = f.kind === "num" ? num(x) : f.kind === "date" ? isoDate(x) : f.key === "jobNo" ? jobOf(x) : f.key === "warehouse" ? normWarehouse(x) : txt(x);
  }
  return e as OutwardEntry;
}

/** The outward sheet (rows; header in the first 10) → { entries, issues }. `today` flags future dates. */
export function rowsFromOutwardSheet(aoa: unknown[][], today?: string): { entries: OutwardEntry[]; issues: SheetIssue[] } {
  const hr = aoa.slice(0, 10).findIndex((r) => (r || []).some((c) => hk(c) === "obdate") && (r || []).some((c) => hk(c) === "productname"));
  if (hr < 0) throw new Error("No Outward table found — expected a header row with “OB Date” and “Product Name”.");
  const H = aoa[hr].map(hk);
  const col = Object.fromEntries(OUTWARD_FIELDS.map((f) => [f.key, H.indexOf(hk(f.label))])) as Record<OutwardKey, number>;
  if (col.qty < 0) throw new Error("No “Qty” column found.");
  const entries: OutwardEntry[] = [];
  const issues: SheetIssue[] = [];
  aoa.slice(hr + 1).forEach((r, j) => {
    if (!r || !r.some((c) => txt(c))) return;
    const raw = Object.fromEntries(Object.entries(col).map(([k, i]) => [k, i >= 0 ? r[i] : null]));
    const e = cleanOutward(raw);
    const row = hr + j + 2;
    if (!e.productName && !e.batchNo && e.qty === null) return;
    if (!e.obDate) issues.push({ row, msg: `OB date “${txt(raw.obDate)}” isn't a date` });
    else if (today && e.obDate > today) issues.push({ row, msg: `${e.productName} ${e.batchNo}: OB date ${showDate(e.obDate)} is in the future` });
    if (e.qty === null) issues.push({ row, msg: `${e.productName} ${e.batchNo}: no quantity` });
    if (!e.batchNo) issues.push({ row, msg: `${e.productName}: no batch number — it can't come off an inward batch` });
    entries.push(e);
  });
  return { entries, issues };
}

/** Same dispatch line? (to skip rows already in the ERP when adding from the sheet again) */
export const outKey = (e: Pick<OutwardEntry, "jobNo" | "obDate" | "customer" | "batchNo" | "qty" | "grnNo">) =>
  [e.jobNo, e.obDate, e.customer, e.batchNo, e.qty, e.grnNo].map((x) => String(x ?? "").trim().toLowerCase()).join("|");

type InLine = Pick<InwardEntry, "batchNo" | "inwardDate" | "netWeight" | "outwardQty" | "productName" | "catalogueName"> & { id?: string; createdAt?: string };
type OutLine = Pick<OutwardEntry, "batchNo" | "qty" | "productName" | "catalogueName"> & { source?: string };

/**
 * Dispatches entered in the ERP → extra Outward Qty on each inward line. (Lines imported from the
 * sheets are already counted in the Inward sheet's own Outward Qty, so only source "crm" lines move
 * stock.) A batch's kg comes off its inward lines oldest first, each up to the stock it still holds;
 * anything beyond that stays on the last line (it then shows negative stock). A batch number shared by
 * more than one material only takes from the lines of the dispatched material, and placeholder batches
 * ("N.A", blank) never match. Returns { byId: { inwardId: extra qty }, unmatched: ERP lines whose batch has no inward line }.
 */
export function allocate<I extends InLine, O extends OutLine>(inward: I[], outward: O[]): { byId: Record<string, number>; unmatched: O[] } {
  const lines = new Map<string, I[]>();
  for (const r of inward) {
    const k = batchKey(r.batchNo);
    if (!k) continue;
    const l = lines.get(k);
    if (l) l.push(r);
    else lines.set(k, [r]);
  }
  for (const l of lines.values())
    l.sort((a, b) => String(a.inwardDate || "").localeCompare(String(b.inwardDate || "")) || String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  const total = new Map<string, { ls: I[]; q: number }>();
  const unmatched: O[] = [];
  for (const o of outward) {
    if (o.source !== "crm") continue;
    const k = batchKey(o.batchNo);
    const q = num(o.qty) || 0;
    if (isPlaceholderBatch(o.batchNo) || !lines.has(k)) {
      unmatched.push(o);
      continue;
    }
    let ls = lines.get(k)!;
    if (new Set(ls.map(matKey)).size > 1) {
      const mine = ls.filter((r) => (matKey(o) && matKey(r) === matKey(o)) || (nk(o.productName) && nk(r.productName) === nk(o.productName)));
      if (!mine.length) {
        unmatched.push(o);
        continue;
      }
      ls = mine;
    }
    const g = k + "|" + ls.map((r) => r.id).join(",");
    const t = total.get(g) || { ls, q: 0 };
    t.q += q;
    total.set(g, t);
  }
  const byId: Record<string, number> = {};
  for (const { ls, q } of total.values()) {
    let left = r3(q);
    ls.forEach((r, i) => {
      const id = String(r.id);
      const room = Math.max(0, (num(r.netWeight) || 0) - (num(r.outwardQty) || 0) - (byId[id] || 0));
      const take = i === ls.length - 1 ? left : Math.min(left, room);
      if (take) byId[id] = r3((byId[id] || 0) + take);
      left -= take;
    });
  }
  return { byId, unmatched };
}

export type WithOutward = { sheetOutwardQty?: number | null; crmOutwardQty?: number };

/** Inward lines with the ERP's dispatches added to their Outward Qty. */
export function withOutward<I extends InLine>(inward: I[], outward: OutLine[]): (I & WithOutward)[] {
  const { byId } = allocate(inward, outward);
  return inward.map((r) => {
    const extra = byId[String(r.id)];
    return extra ? { ...r, sheetOutwardQty: r.outwardQty, crmOutwardQty: extra, outwardQty: r3((num(r.outwardQty) || 0) + extra) } : r;
  });
}

/** An inward line received from one of our own warehouses (Supplier "AG Ballabgarh warehouse") — a stock transfer. */
export const isTransferIn = (r: { supplier?: string; location?: string }) =>
  (LOCATIONS as readonly string[]).includes(normWarehouse(r.supplier)) && normWarehouse(r.supplier) !== normWarehouse(r.location);

export type SheetDifference = {
  batchNo: string;
  productName: string;
  inwardOutward: number;
  outwardLines: number;
  transferred: number;
  transfers: { grnNo: string; date: string; from: string; to: string; qty: number }[];
  diff: number;
};

/**
 * Batches where the Inward sheet's Outward Qty ≠ the outward lines imported from the sheet.
 * A transfer between our warehouses is marked out on the sending line but has no outward line —
 * so the kg re-received elsewhere (isTransferIn) count as accounted for. `diff` is what's still
 * unexplained (negative: more moved or dispatched than the sending line marks out); batches the
 * transfers fully explain are left out. Batch keys here ignore leading zeros per token.
 */
export function sheetDifferences(
  inward: (Pick<InwardEntry, "batchNo" | "productName" | "outwardQty" | "supplier" | "location" | "netWeight" | "grnNo" | "inwardDate">)[],
  outward: (Pick<OutwardEntry, "batchNo" | "qty"> & { source?: string })[],
): SheetDifference[] {
  const bk = (b: unknown) =>
    String(b ?? "").toUpperCase().split(/[^A-Z0-9]+/).map((t) => (/^\d+$/.test(t) ? String(+t) : t)).join("|").replace(/^\||\|$/g, "");
  const inw = new Map<string, Omit<SheetDifference, "outwardLines" | "diff">>();
  const out = new Map<string, number>();
  for (const r of inward) {
    const k = bk(r.batchNo);
    if (!k) continue;
    const o = inw.get(k) || { batchNo: r.batchNo, productName: r.productName, inwardOutward: 0, transferred: 0, transfers: [] };
    o.inwardOutward += num(r.outwardQty) || 0;
    if (isTransferIn(r)) {
      o.transferred += num(r.netWeight) || 0;
      o.transfers.push({ grnNo: r.grnNo, date: r.inwardDate, from: normWarehouse(r.supplier), to: r.location, qty: num(r.netWeight) || 0 });
    }
    inw.set(k, o);
  }
  for (const o of outward) {
    if (o.source === "crm") continue;
    const k = bk(o.batchNo);
    if (!k) continue;
    out.set(k, (out.get(k) || 0) + (num(o.qty) || 0));
  }
  return [...inw.entries()]
    .map(([k, v]) => {
      const outwardLines = r3(out.get(k) || 0);
      const inwardOutward = r3(v.inwardOutward);
      const transferred = r3(v.transferred);
      return { ...v, inwardOutward, outwardLines, transferred, diff: r3(inwardOutward - outwardLines - transferred) };
    })
    .filter((d) => Math.abs(d.diff) > 0.01)
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}
