/**
 * Batch inventory → Lost and Found, and Damage and Relabelling: registers of stock issues.
 * Lost and Found follows the tracker's "Inventory Loss" sheet: one line per shortage /
 * excess / missing bag, with the money at stake, who is solving it and who takes the hit.
 * They don't move stock — Stock in Hand comes from Inward and Outward. Pure config + cleaning.
 */
import { LOCATIONS, hk, isoDate, num, showDate, type SheetIssue } from "./inward";

export type RegisterKind = "lost-found" | "damage";
export type RegisterFieldKind = "text" | "date" | "num" | "qty" | "select" | "textarea";
export type RegisterField = {
  key: string;
  label: string;
  short?: string;
  /** Header in the old sheet ("" = the unnamed column after the last header). */
  sheet?: string;
  kind?: RegisterFieldKind;
  /** select: the fixed list. */
  options?: readonly string[];
  /** Hints only. */
  suggest?: readonly string[];
  wide?: boolean;
  /** Shown as a table column. */
  list?: boolean;
  /** Types (Damage register) the field applies to. */
  only?: readonly string[];
};
export type RegisterDef = { label: string; href: string; intro: string; sheetName?: string; statuses: readonly string[]; fields: RegisterField[] };

export const REGISTERS: Record<RegisterKind, RegisterDef> = {
  "lost-found": {
    label: "Lost and Found",
    href: "/b2b/inventory/lost-and-found",
    intro: "Material short, extra, missing or damaged in transit or in the warehouse — the money at stake, who is solving it, and who takes the hit. One line per issue.",
    sheetName: "Inventory Loss",
    statuses: ["Loop open", "Loop closed"],
    fields: [
      { key: "issueDate", label: "Issue date", sheet: "Issue date", kind: "date", list: true },
      { key: "jobNo", label: "SCM Job No.", sheet: "SCM Job No.", list: true },
      { key: "origin", label: "Origin (Sx / WH / JW)", short: "Origin", sheet: "Sx / WH / JW", suggest: LOCATIONS, list: true },
      { key: "destination", label: "Destination (Cx / JW / WH)", short: "Destination", sheet: "Cx / JW / WH", suggest: LOCATIONS, list: true },
      { key: "productName", label: "Product Name", sheet: "Product Name", wide: true, list: true },
      { key: "batchNo", label: "Batch No.", sheet: "Batch No.", list: true },
      { key: "qty", label: "Qty (kg)", sheet: "Qty.", kind: "qty", list: true },
      { key: "etd", label: "ETD", sheet: "ETD", kind: "date", list: true },
      { key: "price", label: "Price (₹ / kg)", sheet: "Price (Rs. / Kg)", kind: "num" },
      { key: "expectedLoss", label: "Expected loss (₹)", short: "Expected loss", sheet: "Expected Losses", kind: "num", list: true },
      { key: "creditNote", label: "Credit Note", sheet: "Credit Note", suggest: ["Sent", "Pending", "Not required", "NA"], list: true },
      { key: "insurance", label: "Insurance claim", sheet: "Insurrance Claimed", suggest: ["Not required", "Need to claim", "In Process", "Claimed", "Settled"] },
      { key: "remarks", label: "What happened", sheet: "Remarks", kind: "textarea", wide: true, list: true },
      { key: "story", label: "Story", sheet: "Story", kind: "textarea", wide: true },
      { key: "timeline", label: "Timeline", sheet: "Timeline", kind: "date" },
      { key: "poc", label: "POC solving", sheet: "POC Solving", list: true },
      { key: "nextActions", label: "Next actionables", sheet: "Next Actionables", kind: "textarea", wide: true },
      { key: "status", label: "Final status", sheet: "Final Status", kind: "select", options: ["Loop open", "Loop closed"], list: true },
      { key: "hitBy", label: "Monetary hit taken by", short: "Hit taken by", sheet: "Monetry Hit taken By", suggest: ["AG", "Customer", "Warehouse", "Supplier", "Transporter", "Insurance", "NA"], list: true },
      { key: "notes", label: "Follow-up notes", sheet: "", kind: "textarea", wide: true },
    ],
  },
  damage: {
    label: "Damage and Relabelling",
    href: "/b2b/inventory/damage",
    intro: "Damaged packs, and stock relabelled or repacked in the warehouse — what happened, how much, and what was done. One line per batch.",
    statuses: ["Open", "Closed"],
    fields: [
      { key: "date", label: "Date", kind: "date", list: true },
      { key: "type", label: "Type", kind: "select", options: ["Damage", "Relabelling", "Repacking"], list: true },
      { key: "warehouse", label: "Warehouse", kind: "select", options: LOCATIONS, list: true },
      { key: "productName", label: "Product Name", wide: true, list: true },
      { key: "batchNo", label: "Batch No.", list: true },
      { key: "qty", label: "Qty (kg)", kind: "qty", list: true },
      { key: "units", label: "Units (drums / bags)", kind: "num", list: true },
      { key: "issue", label: "What happened", suggest: ["Leakage", "Torn bag", "Dented / broken drum", "Wet / moisture", "Label damaged", "Wrong label", "Label missing", "Contaminated"], list: true },
      { key: "foundAt", label: "Found at", suggest: ["Receiving (on arrival)", "In storage", "Picking / loading", "Customer complaint"] },
      { key: "newBatchNo", label: "New batch no.", list: true, only: ["Relabelling", "Repacking"] },
      { key: "newLabel", label: "New label / product name", only: ["Relabelling", "Repacking"] },
      { key: "action", label: "Action", suggest: ["Repacked", "Relabelled", "Sold as is", "Written off", "Returned to supplier", "Claim with transporter", "Pending"], list: true },
      { key: "jobNo", label: "Job / GRN reference" },
      { key: "cost", label: "Cost (₹)", kind: "num" },
      { key: "poc", label: "Reported by" },
      { key: "status", label: "Status", kind: "select", options: ["Open", "Closed"], list: true },
      { key: "remarks", label: "Remarks", kind: "textarea", wide: true, list: true },
    ],
  },
};

export type RegisterEntry = Record<string, string | number | null>;

const txt = (v: unknown) => (v === null || v === undefined ? "" : String(v).replace(/\r/g, "").trim());

/** "25 Kgs" → 25, "250 gms" → 0.25, "3.65 kgs", "2kg", "1 MT" → 1000; a plain number is kg. */
export function qtyKg(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const m = String(v ?? "").replace(/,/g, "").trim().match(/^(-?\d+(?:\.\d+)?)\s*([a-z]*)\.?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  const u = m[2].toLowerCase();
  if (!u || /^(kg|kgs|kilo|kilos|ltr|ltrs|l)$/.test(u)) return n;
  if (/^(g|gm|gms|gram|grams|gr)$/.test(u)) return Math.round(n) / 1000;
  if (/^(mt|ton|tons|tonne|tonnes)$/.test(u)) return n * 1000;
  return null;
}

/** One stored entry from form or sheet values: numbers read, dates as YYYY-MM-DD, unknown keys dropped. */
export function cleanEntry(kind: RegisterKind, v: Record<string, unknown> | null | undefined): RegisterEntry {
  const R = REGISTERS[kind];
  if (!R) throw new Error("Unknown register");
  const e: RegisterEntry = {};
  for (const f of R.fields) {
    const x = v?.[f.key];
    e[f.key] =
      f.kind === "num" ? num(typeof x === "string" ? x.replace(/[₹\s]/g, "") : x) : f.kind === "qty" ? qtyKg(x) : f.kind === "date" ? isoDate(x) : txt(x);
    if (f.kind === "select" && f.options && !f.options.includes(String(e[f.key])))
      e[f.key] = f.options.find((o) => hk(o) === hk(e[f.key])) || f.options[0];
  }
  if ("expectedLoss" in e && e.expectedLoss === null && e.qty !== null && e.price !== null)
    e.expectedLoss = Math.round(Number(e.qty) * Number(e.price) * 100) / 100;
  return e;
}

/** Why an entry can't be saved, or "". */
export function problem(e: RegisterEntry): string {
  if (!e.productName) return "Enter the product.";
  if (e.qty === null && !(Number(e.units) > 0)) return "Enter the quantity (e.g. 25, 250 gms).";
  return "";
}

export const labelOf = (e: RegisterEntry) =>
  [e.type, e.productName, e.qty !== null && e.qty !== undefined ? `${e.qty} kg` : "", e.jobNo && `Job ${e.jobNo}`].filter(Boolean).join(" · ") || "Entry";

/** Same issue? (to skip lines already in the ERP when adding from the sheet again) */
export const entryKey = (e: RegisterEntry) =>
  [e.jobNo, e.productName, e.qty, e.etd || e.date, e.batchNo].map((x) => String(x ?? "").trim().toLowerCase()).join("|");

/** The register's sheet (rows; header in the first 10, at least 4 known headers) → { entries, issues }. */
export function rowsFromRegisterSheet(kind: RegisterKind, aoa: unknown[][]): { entries: RegisterEntry[]; issues: SheetIssue[] } {
  const R = REGISTERS[kind];
  const withSheet = R.fields.filter((f) => f.sheet);
  const hr = aoa.slice(0, 10).findIndex((r) => withSheet.filter((f) => (r || []).some((c) => hk(c) === hk(f.sheet))).length >= 4);
  if (hr < 0) throw new Error(`No ${R.label} table found — expected a header row like “${withSheet.slice(0, 4).map((f) => f.sheet).join(", ")}”.`);
  const H = aoa[hr].map(hk);
  const col: Record<string, number> = Object.fromEntries(withSheet.map((f) => [f.key, H.indexOf(hk(f.sheet))]));
  // an unnamed column after the last header holds follow-up notes
  const last = H.reduce((a, h, i) => (h ? i : a), -1);
  if (R.fields.some((f) => f.key === "notes")) col.notes = last + 1;
  const entries: RegisterEntry[] = [];
  const issues: SheetIssue[] = [];
  aoa.slice(hr + 1).forEach((r, j) => {
    if (!r || !r.some((c) => txt(c))) return;
    const raw: Record<string, unknown> = Object.fromEntries(Object.entries(col).map(([k, i]) => [k, i >= 0 ? r[i] : null]));
    if (!txt(raw.productName) && !txt(raw.qty)) return;
    const e = cleanEntry(kind, { ...raw, status: raw.status || R.statuses[0] });
    const row = hr + j + 2;
    const what = `${e.productName || "?"}${e.jobNo ? ` (job ${e.jobNo})` : ""}`;
    if (txt(raw.qty) && e.qty === null) issues.push({ row, msg: `${what}: quantity “${txt(raw.qty)}” isn't a weight` });
    if (txt(raw.price) && e.price === null) issues.push({ row, msg: `${what}: price “${txt(raw.price)}” isn't a number — check the columns on this row` });
    for (const f of R.fields.filter((x) => x.kind === "date")) if (txt(raw[f.key]) && !e[f.key]) issues.push({ row, msg: `${what}: ${f.label} “${txt(raw[f.key])}” isn't a date` });
    if (!txt(raw.status)) issues.push({ row, msg: `${what}: no final status — saved as “${e.status}”` });
    entries.push(e);
  });
  return { entries, issues };
}

export const showValue = (f: RegisterField, v: unknown) =>
  v === null || v === undefined || v === ""
    ? ""
    : f.kind === "date"
      ? showDate(String(v))
      : f.kind === "num" || f.kind === "qty"
        ? Number(v).toLocaleString("en-IN", { maximumFractionDigits: 3 })
        : String(v);

/** The date field that goes into InventoryIssue.date for each register. */
export const DATE_FIELD: Record<RegisterKind, string> = { "lost-found": "issueDate", damage: "date" };
/** Fields kept in InventoryIssue's own columns; the rest go in its `data` JSON. */
export const COLUMN_FIELDS = new Set(["status", "jobNo", "productName", "batchNo", "qty", "issueDate", "date"]);

export type RegisterSummary = { open: number; atStake: number; byAg: number; kgDamaged: number; relabelled: number };

/** Lost and Found: open, ₹ at stake on open issues, ₹ taken by AG. Damage: open, kg damaged, relabelled or repacked. */
export function registerSummary(kind: RegisterKind, entries: RegisterEntry[]): RegisterSummary {
  const R = REGISTERS[kind];
  const isOpen = (e: RegisterEntry) => e.status === R.statuses[0];
  const loss = (e: RegisterEntry) => Number(e.expectedLoss) || 0;
  return {
    open: entries.filter(isOpen).length,
    atStake: Math.round(entries.filter(isOpen).reduce((a, e) => a + loss(e), 0)),
    byAg: Math.round(entries.filter((e) => /^ag$/i.test(String(e.hitBy ?? ""))).reduce((a, e) => a + loss(e), 0)),
    kgDamaged: Math.round(entries.filter((e) => e.type === "Damage").reduce((a, e) => a + (Number(e.qty) || 0), 0) * 1000) / 1000,
    relabelled: entries.filter((e) => e.type !== "Damage").length,
  };
}
