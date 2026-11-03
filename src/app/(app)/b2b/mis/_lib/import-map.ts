/**
 * Import of the "Domestic MIS FY …" master sheet (CSV or XLSX): the header row is the
 * one containing "Job No.", columns are mapped by their trimmed names (COLMAP), dates
 * are parsed leniently and dropdown values normalised. Pure: takes the sheet as rows of
 * cells (what XLSX.utils.sheet_to_json(ws, { header: 1 }) returns).
 */
import { normalizeSelect, parseMisStatus } from "@/lib/ops/lists";
import { parseDay } from "@/lib/ops/dates";
import { DOC_KEYS, FIELD_BY_KEY, type DocKey, type MisValues } from "./fields";

/** Column name (trimmed, lower-cased) → field key. */
export const COLMAP: Record<string, string> = {
  "job no.": "jobNo",
  "po date": "poDate",
  "planning - actionables": "planningActionables",
  "cx sx alignment to dispatch time": "cxSxAlignmentTime",
  "status confirmned date": "statusConfirmedDate",
  "status confirmed date": "statusConfirmedDate",
  "movement type": "movementType",
  supplier: "supplier",
  customer: "customer",
  "product name": "productName",
  "quantity (in kgs)": "quantityKgs",
  "gross wt (kg)": "grossWtKg",
  status: "status",
  "logistics poc": "logisticsPoc",
  "planned etd (fixed)": "plannedEtd",
  "planned eta (fixed)": "plannedEta",
  "cx quote approval time": "cxQuoteApprovalTime",
  "sx material readiness confirmation time": "sxReadinessTime",
  "actual/  tentative etd": "actualEtd",
  "actual/ tentative etd": "actualEtd",
  "actual / tentative etd": "actualEtd",
  "actual/tentative etd": "actualEtd",
  "actual / tentative eta": "actualEta",
  "actual/ tentative eta": "actualEta",
  "actual/tentative eta": "actualEta",
  packing: "packing",
  "batch no.": "batchNo",
  "batch no": "batchNo",
  "batch number": "batchNo",
  "no. of units": "unitCount",
  "no of units": "unitCount",
  units: "unitCount",
  count: "unitCount",
  "no. of packages": "unitCount",
  "no. of bags": "unitCount",
  "hs code": "hsCode",
  "ag supply poc": "agSupplyPoc",
  "ag demand poc": "agDemandPoc",
  "supply poc": "supplyPoc",
  "pickup address": "pickupAddress",
  "drop address": "dropAddress",
  "customer poc details": "customerPocDetails",
  "logistics type": "logisticsType",
  "vehicle type": "vehicleType",
  "transporter details": "transporterDetails",
  "total logistics cost": "totalLogisticsCost",
  "logistics cost (ag to pay)": "logisticsCostAgToPay",
  "logistics payment term": "logisticsPaymentTerm",
  "origin type": "originType",
  "destination type": "destinationType",
  "taxable value (rs.)": "taxableValue",
  "tax invoice month": "taxInvoiceMonth",
  "tax invoice": "taxInvoice",
  "tax invoiced date": "taxInvoicedDate",
  "e-way bill": "eWayBill",
  coa: "coa",
  "transport doc no": "transportDoc",
  pod: "pod",
  "transport payment status": "transportPaymentStatus",
  "transit time (days)": "transitTimeDays",
  "distance (aprox)": "distanceApprox",
  "blockers and remarks (in case of delayed)": "blockersRemarks",
  "etd - po date": "etdMinusPoDate",
};

const p2 = (n: number) => String(n).padStart(2, "0");

/** Date + optional time → YYYY-MM-DDTHH:mm (Excel serials with a fraction keep their time). */
export function parseDateTime(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const ms = Math.round((v - 25569) * 86_400_000);
    return new Date(ms).toISOString().slice(0, 16);
  }
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "";
    return `${v.getFullYear()}-${p2(v.getMonth() + 1)}-${p2(v.getDate())}T${p2(v.getHours())}:${p2(v.getMinutes())}`;
  }
  const s = String(v).trim();
  const day = parseDay(s);
  if (!day) return "";
  const t = s.match(/[ T,](\d{1,2})[:.](\d{2})\s*(am|pm)?/i);
  let hh = t ? +t[1] : 0;
  const mm = t ? +t[2] : 0;
  if (t?.[3]) {
    const pm = t[3].toLowerCase() === "pm";
    if (pm && hh < 12) hh += 12;
    if (!pm && hh === 12) hh = 0;
  }
  return `${day}T${p2(Math.min(hh, 23))}:${p2(Math.min(mm, 59))}`;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** "2026-10", "10/2026", "Oct-26", "October 2026" or any full date → YYYY-MM. */
export function parseMonth(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${m[1]}-${p2(+m[2])}`;
  m = s.match(/^(\d{1,2})[/\-.](\d{4})$/);
  if (m && +m[1] >= 1 && +m[1] <= 12) return `${m[2]}-${p2(+m[1])}`;
  m = s.match(/^([A-Za-z]{3})[A-Za-z]*[\s\-/']*(\d{2}|\d{4})$/);
  if (m && MONTHS[m[1].toLowerCase()]) return `${m[2].length === 2 ? 2000 + +m[2] : m[2]}-${p2(MONTHS[m[1].toLowerCase()])}`;
  const d = parseDay(typeof v === "number" ? v : s);
  return d ? d.slice(0, 7) : "";
}

/** A raw cell → the value the field holds ("" when it can't be read). */
export function coerce(key: string, raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "string" && !raw.trim()) return "";
  const type = FIELD_BY_KEY[key]?.type;
  if (type === "date") return parseDay(typeof raw === "string" ? raw.trim() : raw);
  if (type === "datetime") return parseDateTime(raw);
  if (type === "month") return parseMonth(raw);
  const v = String(raw).replace(/\s+/g, " ").trim();
  if (key === "status") return parseMisStatus(v) ?? "";
  if (type === "select") return normalizeSelect(key, v) ?? "";
  return v;
}

export type ImportedRow = { values: MisValues; docs: Partial<Record<DocKey, string>> };

const SKIP = new Set(["transitTimeDays", "etdMinusPoDate"]); // recomputed from the dates

/** Sheet rows → MIS rows. Throws when there's no "Job No." header. */
export function parseMisSheet(rows: unknown[][]): ImportedRow[] {
  const headerIdx = rows.findIndex((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim().toLowerCase() === "job no."));
  if (headerIdx === -1) throw new Error("Couldn't find a “Job No.” header row in that file.");
  const keys = rows[headerIdx].map((c) => COLMAP[String(c ?? "").trim().toLowerCase()] ?? null);
  const jobCol = keys.indexOf("jobNo");
  const docKeys = new Set<string>(DOC_KEYS);

  const out: ImportedRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const jobCell = String(r[jobCol] ?? "").trim();
    if (!jobCell || jobCell.toLowerCase() === "job no.") continue;
    const values: MisValues = {};
    const docs: ImportedRow["docs"] = {};
    keys.forEach((k, ci) => {
      if (!k || SKIP.has(k)) return;
      if (docKeys.has(k)) {
        const ref = String(r[ci] ?? "").trim();
        if (ref) docs[k as DocKey] = ref;
        return;
      }
      const v = coerce(k, r[ci]);
      if (v !== "" || values[k] === undefined) values[k] = v;
    });
    values.jobNo = jobCell.replace(/\.0+$/, "");
    out.push({ values, docs });
  }
  return out;
}

/** Merge an imported row into an existing one: only non-blank cells overwrite. */
export function mergeImported(existing: MisValues, incoming: MisValues): MisValues {
  const merged = { ...existing };
  for (const [k, v] of Object.entries(incoming)) if (String(v ?? "").trim() !== "" && k !== "source") merged[k] = v;
  return merged;
}
