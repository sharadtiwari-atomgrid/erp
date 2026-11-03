// Stock in Hand: filters and export rows, shared by the page (client) and the export route. Pure.
import { shortLoc, showDate, type MaterialRow, type StockCheck, type StockLine } from "@/lib/batch-inventory";

export type StockFilter = { q: string; wh: string; type: string; band: string; exp: string };
export const emptyFilter: StockFilter = { q: "", wh: "", type: "", band: "", exp: "" };

export function filterLines(all: StockLine[], f: StockFilter): StockLine[] {
  const t = f.q.trim().toLowerCase();
  return all.filter(
    (l) =>
      (!f.wh || l.location === f.wh) &&
      (!f.type || (l.type || "—") === f.type) &&
      (!f.band || l.band === f.band) &&
      (!f.exp || l.expiry === f.exp) &&
      (!t || [l.material, l.productName, l.batchNo, l.supplier, l.grnNo, l.jobNo].some((v) => String(v || "").toLowerCase().includes(t))),
  );
}

export type SortKey = "material" | "stock" | "batches" | "oldest" | "toExpiry" | "value";
export type Sort = { k: SortKey; d: 1 | -1 };

export function sortMaterials(rows: MaterialRow[], { k, d }: Sort): MaterialRow[] {
  const val = (x: MaterialRow): string | number => (k === "material" ? x.material.toLowerCase() : k === "oldest" ? (x.oldest ?? -1) : k === "toExpiry" ? (x.nextExpiry ?? "9999") : k === "value" ? (x.value ?? -1) : x[k]);
  return rows.slice().sort((a, b) => (val(a) > val(b) ? d : val(a) < val(b) ? -d : 0));
}
export function sortLines(rows: StockLine[], { k, d }: Sort): StockLine[] {
  const val = (l: StockLine): string | number =>
    k === "material" || k === "batches" ? l.material.toLowerCase() : k === "stock" ? l.instockQty : k === "oldest" ? (l.ageing ?? -1) : k === "toExpiry" ? (l.toExpiry ?? 1e9) : (l.value ?? -1);
  return rows.slice().sort((a, b) => (val(a) > val(b) ? d : val(a) < val(b) ? -d : 0) || a.material.localeCompare(b.material));
}

export const materialSheetRow = (m: MaterialRow, warehouses: string[]) => ({
  "Material (AG Catalogue Name)": m.material,
  Type: m.type,
  HSN: m.hsn,
  "Stock (kg)": m.stock,
  Packs: m.packs ?? "",
  Batches: m.batches,
  ...Object.fromEntries(warehouses.map((w) => [`${shortLoc(w)} (kg)`, m.byWh[w] || 0])),
  "Expired (kg)": m.expiredKg,
  "Expiring ≤ 90 days (kg)": m.soonKg,
  "Value (₹)": m.value ?? "",
  "Avg rate (₹/kg)": m.avgRate ?? "",
  "Oldest (days)": m.oldest ?? "",
  "Next expiry": m.nextExpiry ? showDate(m.nextExpiry) : "",
  License: m.license,
});

export const batchSheetRow = (l: StockLine) => ({
  "Material (AG Catalogue Name)": l.material,
  "Product Name": l.productName,
  "Batch No.": l.batchNo,
  Warehouse: l.location,
  "Stock (kg)": l.instockQty,
  Packs: l.packs ?? "",
  Packaging: String(l.packaging || "").replace(/\n+/g, " · "),
  Type: l.type,
  HSN: l.hsn,
  "Mfg Date": showDate(l.mfgDate),
  "Exp Date": showDate(l.expDate),
  "Days to expiry": l.toExpiry ?? "",
  "Ageing (days)": l.ageing ?? "",
  "Purchase rate (₹/kg)": l.purchaseRate ?? "",
  "Value (₹)": l.value ?? "",
  "Inward Date": showDate(l.inwardDate),
  "GRN No.": l.grnNo,
  "Job No.": l.jobNo,
  Supplier: l.supplier,
  License: l.license,
});

export const checkSheetRows = (checks: StockCheck[]) =>
  checks.flatMap((c) =>
    c.rows.map((r) => ({ Check: c.title, Level: c.level, Material: r.material, "Batch No.": r.batchNo, Warehouse: r.location || "", "GRN No.": r.grnNo || "", Date: showDate(r.inwardDate || ""), "Qty (kg)": r.qty ?? "", Note: r.note || "" })),
  );
