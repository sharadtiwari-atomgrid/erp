import "server-only";
import { db } from "@/lib/db";
import { isoFromDay, todayIso } from "@/lib/ops/dates";
import type { BatchInward, BatchOutward, InventoryIssue } from "@/generated/prisma/client";
import { num, type InwardEntry } from "./inward";
import type { OutwardEntry } from "./outward";
import { stockLines, type StockLine } from "./stock-in-hand";
import { inventoryReport } from "./report";
import { DATE_FIELD, type RegisterEntry, type RegisterKind } from "./registers";
import type { WarehouseMisRow } from "./warehouse-mis";

/*
 * Server-only loaders for the batch inventory ledger. Import from
 * "@/lib/batch-inventory/server" (not re-exported from the index, which is client-safe).
 */

const s = (v: string | null | undefined) => v ?? "";
const n = (v: unknown) => (v === null || v === undefined ? null : num(v));

/** A BatchInward row → the plain entry the stock maths and the pages use. */
export function inwardFromRow(r: BatchInward): InwardEntry & { id: string; createdAt: string } {
  return {
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    jobNo: s(r.jobNo),
    inwardDate: isoFromDay(r.inwardDate),
    location: r.location,
    funnel: s(r.funnel),
    supplyPoc: s(r.supplyPoc),
    grnNo: s(r.grnNo),
    manufacturer: s(r.manufacturer),
    supplier: s(r.supplier),
    productName: r.productName,
    catalogueName: s(r.catalogueName),
    type: s(r.type),
    hsn: s(r.hsn),
    batchNo: s(r.batchNo),
    units: n(r.units),
    packaging: s(r.packaging),
    uom: s(r.uom),
    netWeight: n(r.netWeight),
    grossWeight: n(r.grossWeight),
    mfgDate: isoFromDay(r.mfgDate),
    expDate: isoFromDay(r.expDate),
    purchaseRate: n(r.purchaseRate),
    remarks: s(r.remarks),
    outwardQty: n(r.sheetOutwardQty),
    license: s(r.license),
  };
}

/** A BatchOutward row → the plain entry. */
export function outwardFromRow(r: BatchOutward): OutwardEntry & { id: string; createdAt: string; source: string } {
  return {
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    source: r.source,
    jobNo: s(r.jobNo),
    obDate: isoFromDay(r.obDate),
    warehouse: s(r.warehouse),
    funnel: s(r.funnel),
    customer: s(r.customer),
    grnNo: s(r.grnNo),
    productName: r.productName,
    catalogueName: s(r.catalogueName),
    batchNo: s(r.batchNo),
    qty: n(r.qty),
    saleRate: n(r.saleRate),
  };
}

/** An InventoryIssue row → the register entry (its own columns plus the `data` JSON). */
export function registerFromRow(kind: RegisterKind, r: InventoryIssue): RegisterEntry & { id: string } {
  const data = (r.data && typeof r.data === "object" && !Array.isArray(r.data) ? r.data : {}) as Record<string, string | number | null>;
  return {
    ...data,
    id: r.id,
    [DATE_FIELD[kind]]: isoFromDay(r.date),
    status: r.status ?? "",
    jobNo: r.jobNo ?? "",
    productName: r.productName ?? "",
    batchNo: r.batchNo ?? "",
    qty: n(r.qtyKg),
  };
}

const LIVE = { deletedAt: null } as const;

/** Live inward lines, oldest first. */
export async function loadInward() {
  const rows = await db.batchInward.findMany({ where: LIVE, orderBy: [{ inwardDate: "asc" }, { createdAt: "asc" }] });
  return rows.map(inwardFromRow);
}

/** Live outward lines, newest first. */
export async function loadOutward() {
  const rows = await db.batchOutward.findMany({ where: LIVE, orderBy: [{ obDate: "desc" }, { createdAt: "desc" }] });
  return rows.map(outwardFromRow);
}

/** Live BatchInward and BatchOutward → the computed stock lines as of `today` (IST today by default). */
export async function loadStockLines(today: string = todayIso()): Promise<StockLine[]> {
  const [inward, outward] = await Promise.all([loadInward(), loadOutward()]);
  return stockLines(inward, outward, today);
}

/** The last uploaded warehouse MIS (WarehouseCount kind "warehouse-mis"), or null. */
export async function loadWarehouseMis() {
  const c = await db.warehouseCount.findUnique({ where: { kind: "warehouse-mis" } });
  if (!c) return null;
  return { fileName: c.fileName, countDate: isoFromDay(c.countDate), uploadedAt: c.uploadedAt.toISOString(), rows: (Array.isArray(c.rows) ? c.rows : []) as unknown as WarehouseMisRow[] };
}

/** Inventory Report EOD for `day`, from the live ledger and the last uploaded warehouse MIS. */
export async function loadInventoryReport(day: string = todayIso()) {
  const [inward, outward, wh] = await Promise.all([loadInward(), loadOutward(), loadWarehouseMis()]);
  return { ...inventoryReport({ inward, outward, whRows: wh?.rows ?? null, day }), warehouseMis: wh ? { fileName: wh.fileName, countDate: wh.countDate, uploadedAt: wh.uploadedAt } : null };
}
