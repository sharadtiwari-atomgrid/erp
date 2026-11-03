import "server-only";
import * as XLSX from "xlsx";
import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { dayFromIso, isoFromDay } from "@/lib/ops/dates";
import { labelDate, lineKey, outKey, type InwardEntry, type OutwardEntry } from "@/lib/batch-inventory";
import type { JobRef, Masters } from "./types";

/** Admin-only actions (sheet "replace" imports): full-access roles, or a role named Admin. */
export const isAdmin = (user: CurrentUser) => user.fullAccess || /admin/i.test(user.roleName);

const t = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
const d = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? dayFromIso(iso) : null);

/** An inward entry → BatchInward columns. Mfg / Exp written as month-year become the 1st / last day. */
export function inwardData(e: InwardEntry): Omit<Prisma.BatchInwardUncheckedCreateInput, "id"> {
  // Dates the columns can't hold ("TBC", "see COA") are kept in Remarks so nothing typed is lost.
  const unread = [
    e.mfgDate && !labelDate(e.mfgDate, false) ? `Mfg: ${e.mfgDate}` : "",
    e.expDate && !labelDate(e.expDate, true) ? `Exp: ${e.expDate}` : "",
  ].filter((x) => x && !e.remarks.includes(x));
  const remarks = [e.remarks.trim(), ...unread].filter(Boolean).join(" · ");
  return {
    jobNo: t(e.jobNo),
    inwardDate: d(e.inwardDate),
    location: e.location.trim() || "AG Warehouse (Panoli)",
    funnel: t(e.funnel),
    supplyPoc: t(e.supplyPoc),
    grnNo: t(e.grnNo),
    manufacturer: t(e.manufacturer),
    supplier: t(e.supplier),
    productName: e.productName.trim(),
    catalogueName: t(e.catalogueName),
    type: t(e.type),
    hsn: t(e.hsn),
    batchNo: t(e.batchNo),
    units: e.units,
    packaging: t(e.packaging),
    uom: t(e.uom),
    netWeight: e.netWeight ?? 0,
    grossWeight: e.grossWeight,
    mfgDate: d(labelDate(e.mfgDate, false)),
    expDate: d(labelDate(e.expDate, true)),
    purchaseRate: e.purchaseRate,
    remarks: t(remarks),
    sheetOutwardQty: e.outwardQty,
    license: t(e.license),
    lineKey: lineKey(e),
  };
}

/** An outward entry → BatchOutward columns. */
export function outwardData(e: OutwardEntry, source: "crm" | "sheet"): Omit<Prisma.BatchOutwardUncheckedCreateInput, "id"> {
  return {
    source,
    jobNo: t(e.jobNo),
    obDate: d(e.obDate),
    warehouse: t(e.warehouse),
    funnel: t(e.funnel),
    customer: t(e.customer),
    grnNo: t(e.grnNo),
    productName: e.productName.trim() || e.catalogueName.trim() || "—",
    catalogueName: t(e.catalogueName),
    batchNo: t(e.batchNo),
    qty: e.qty ?? 0,
    saleRate: e.saleRate,
    outKey: outKey(e),
  };
}

/** An uploaded workbook (xlsx / xls / csv) → { sheet name: rows }. Server-side. */
export async function readSheets(file: File): Promise<Record<string, unknown[][]>> {
  if (!file || !file.size) throw new Error("Choose a file first.");
  if (file.size > 25 * 1024 * 1024) throw new Error("The file is larger than 25 MB.");
  // As the source read them: date cells as Dates (local midnight); CSV text kept as written.
  const wb = /\.csv$/i.test(file.name)
    ? XLSX.read(new TextDecoder().decode(await file.arrayBuffer()), { type: "string", raw: true })
    : XLSX.read(await file.arrayBuffer(), { cellDates: true });
  return Object.fromEntries(wb.SheetNames.map((n) => [n, XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: true })]));
}

/** The sheet whose name matches (e.g. /inward/i), else the first. */
export function pickSheet(sheets: Record<string, unknown[][]>, re: RegExp): unknown[][] {
  const names = Object.keys(sheets);
  return sheets[names.find((n) => re.test(n)) ?? names[0]] ?? [];
}

/** Pick-lists: Product master, suppliers / customers from Contacts, and OpsPoc names. */
export async function loadMasters(): Promise<Masters> {
  const [products, contacts, pocs] = await Promise.all([
    db.product.findMany({ where: { isActive: true }, select: { name: true, hsnCode: true, productClass: true }, orderBy: { name: "asc" } }),
    db.contact.findMany({ where: { isActive: true }, select: { name: true, roles: true }, orderBy: { name: "asc" } }),
    db.opsPoc.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    products: products.map((p) => ({ name: p.name, hsn: p.hsnCode ?? "", type: p.productClass ?? "" })),
    suppliers: contacts.filter((c) => c.roles.includes("SUPPLIER")).map((c) => c.name),
    customers: contacts.filter((c) => c.roles.includes("CUSTOMER")).map((c) => c.name),
    pocs: pocs.map((p) => p.name),
  };
}

/** Domestic MIS jobs for "Job No. pulls the details" (most recent 1500). */
export async function loadJobs(): Promise<JobRef[]> {
  const jobs = await db.misJob.findMany({
    where: { deletedAt: null },
    select: { jobNo: true, supplier: true, customer: true, productName: true, agSupplyPoc: true, batchNo: true, quantityKgs: true, actualEtd: true },
    orderBy: { createdAt: "desc" },
    take: 1500,
  });
  return jobs.map((j) => ({
    jobNo: j.jobNo,
    supplier: j.supplier ?? "",
    customer: j.customer ?? "",
    productName: j.productName ?? "",
    supplyPoc: j.agSupplyPoc ?? "",
    batchNo: j.batchNo ?? "",
    quantityKgs: j.quantityKgs === null ? "" : String(Number(j.quantityKgs)),
    etd: isoFromDay(j.actualEtd),
  }));
}
