// Filters shared by the pages (client) and the export route handlers (server). Pure.
import { INWARD_FIELDS, OUTWARD_FIELDS, showDate, withCalc, withOutward, type Calculated, type InwardEntry, type OutwardEntry, type WithOutward } from "@/lib/batch-inventory";

export type InwardRow = InwardEntry & WithOutward & Calculated & { id: string };
export type OutwardRow = OutwardEntry & { id: string; source: string };

/** Inward lines with ERP dispatches added and Instock / Ageing worked out. */
export type OutwardLite = Pick<OutwardEntry, "batchNo" | "qty" | "productName" | "catalogueName"> & { id?: string; source?: string };
export const inwardRows = (inward: (InwardEntry & { id: string })[], outward: OutwardLite[], today: string): InwardRow[] =>
  withOutward(inward, outward).map((r) => withCalc(r, today));

export type InwardFilter = { q: string; loc: string; stock: boolean };
export function filterInward(rows: InwardRow[], f: InwardFilter): InwardRow[] {
  const t = f.q.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (!f.loc || r.location === f.loc) &&
      (!f.stock || (r.instockQty ?? 0) > 0.0005) &&
      (!t || [r.jobNo, r.grnNo, r.productName, r.catalogueName, r.batchNo, r.supplier, r.manufacturer, r.supplyPoc].some((v) => String(v || "").toLowerCase().includes(t))),
  );
}

export type OutwardFilter = { q: string; wh: string; src: string };
export function filterOutward(rows: OutwardRow[], f: OutwardFilter): OutwardRow[] {
  const t = f.q.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (!f.wh || r.warehouse === f.wh) &&
      (!f.src || r.source === f.src) &&
      (!t || [r.jobNo, r.customer, r.productName, r.catalogueName, r.batchNo, r.grnNo].some((v) => String(v || "").toLowerCase().includes(t))),
  );
}

/** One export row per inward line, headed like the sheet. */
export const inwardSheetRow = (r: InwardRow) =>
  Object.fromEntries(
    INWARD_FIELDS.map((f) => {
      const v = (r as unknown as Record<string, unknown>)[f.key];
      return [f.label, f.key === "inwardDate" || f.key === "mfgDate" || f.key === "expDate" ? showDate(String(v ?? "")) : f.key === "ageing" ? (v === null ? "N/A" : v) : (v ?? "")];
    }),
  );

export const outwardSheetRow = (r: OutwardRow) =>
  Object.fromEntries([
    ...OUTWARD_FIELDS.map((f) => {
      const v = (r as unknown as Record<string, unknown>)[f.key];
      return [f.label, f.key === "obDate" ? showDate(String(v ?? "")) : (v ?? "")];
    }),
    ["Source", r.source === "crm" ? "ERP" : "Sheet"],
  ]);
