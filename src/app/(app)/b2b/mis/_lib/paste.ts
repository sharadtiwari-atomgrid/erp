/**
 * "Paste from email": turn text copied from an email into MIS fields.
 * Understands "Label<TAB>value" and "Label: value" lines (a line with neither
 * continues the value above), and a table pasted as a header row plus value rows.
 * Labels are the MIS column names (as in the sheet import) plus the words emails
 * usually use. Pure.
 */
import { ALL_FIELDS, FIELD_BY_KEY } from "./fields";
import { COLMAP, coerce } from "./import-map";

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

const SYNONYMS: Record<string, string[]> = {
  jobNo: ["job", "job no", "job number", "job #"],
  productName: ["product", "material", "molecule", "item", "product name", "material name"],
  customer: ["customer name", "consignee", "buyer", "party", "client"],
  supplier: ["supplier name", "consignor", "vendor", "seller"],
  quantityKgs: ["qty", "quantity", "qty (kg)", "qty kg", "quantity (kg)", "net weight", "net wt", "quantity kgs"],
  grossWtKg: ["gross weight", "gross wt"],
  unitCount: ["no of bags", "no. of bags", "bags", "units", "no of units", "no. of units", "drums", "no of drums"],
  batchNo: ["batch", "batch no", "batch number", "lot no", "lot number"],
  packing: ["packaging", "pack size", "packing type"],
  hsCode: ["hsn", "hsn code", "hs code"],
  pickupAddress: ["pickup", "pick up address", "pickup address", "loading point", "loading address", "from address", "dispatch from"],
  pickupPincode: ["pickup pincode", "pick up pincode", "loading pincode", "from pincode"],
  dropAddress: ["delivery address", "drop", "drop address", "unloading point", "unloading address", "ship to", "deliver to", "to address"],
  dropPincode: ["delivery pincode", "drop pincode", "unloading pincode", "to pincode"],
  vehicleType: ["vehicle", "vehicle type", "truck type"],
  transporterDetails: ["transporter", "transporter name", "transport", "carrier"],
  totalLogisticsCost: ["freight", "freight cost", "logistics cost", "freight amount"],
  plannedEtd: ["planned dispatch", "planned etd", "planned dispatch date"],
  actualEtd: ["etd", "dispatch date", "date of dispatch", "dispatched on"],
  plannedEta: ["planned eta", "planned delivery"],
  actualEta: ["eta", "delivery date", "expected delivery", "delivered on"],
  taxableValue: ["taxable value", "invoice value", "basic value", "taxable amount"],
  taxInvoicedDate: ["invoice date", "tax invoice date"],
  customerPocDetails: ["customer poc", "contact person", "customer contact"],
  blockersRemarks: ["remarks", "notes", "comments"],
  poDate: ["po date", "order date"],
};

const SKIP_TYPES = new Set(["file", "computed"]);

const LABELS = (() => {
  const m = new Map<string, string>();
  for (const [k, v] of Object.entries(COLMAP)) if (!SKIP_TYPES.has(FIELD_BY_KEY[v]?.type ?? "")) m.set(norm(k), v);
  for (const f of ALL_FIELDS) if (!SKIP_TYPES.has(f.type)) m.set(norm(f.label), f.key);
  for (const [key, words] of Object.entries(SYNONYMS)) for (const w of words) if (!m.has(norm(w))) m.set(norm(w), key);
  return m;
})();

function value(key: string, raw: string): string {
  const v = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!v) return "";
  const type = FIELD_BY_KEY[key]?.type;
  if (type === "number") {
    const m = v.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
    return m ? m[0] : "";
  }
  return coerce(key, v);
}

export type PasteResult = { values: Record<string, string>; unknown: string[]; rows: number };

export function parseMisPaste(text: string): PasteResult {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/ /g, " "))
    .filter((l) => l.trim());
  const values: Record<string, string> = {};
  const unknown: string[] = [];
  const put = (label: string, raw: string) => {
    const key = LABELS.get(norm(label));
    if (!key) {
      if (String(raw).trim() && norm(label)) unknown.push(label.trim());
      return;
    }
    const v = value(key, raw);
    if (v !== "" && values[key] === undefined) values[key] = v;
  };

  // A table: header row + value row(s), tab-separated, most headers known.
  const cells = (l: string) => l.split("\t").map((c) => c.trim());
  if (lines.length >= 2 && cells(lines[0]).length >= 3) {
    const head = cells(lines[0]);
    const known = head.filter((h) => LABELS.has(norm(h))).length;
    if (known >= Math.max(2, head.length / 2)) {
      const rows = lines.slice(1).map(cells).filter((r) => r.some(Boolean));
      if (rows.length) head.forEach((h, i) => put(h, rows[0][i] ?? ""));
      return { values, unknown, rows: rows.length };
    }
  }

  // Label / value lines.
  const pairs: Array<[string, string]> = [];
  for (const line of lines) {
    const tab = line.indexOf("\t");
    const colon = line.match(/^\s*([^:]{2,40}?)\s*[:：]\s*(.*)$/);
    if (tab > 0) pairs.push([line.slice(0, tab), line.slice(tab + 1).replace(/\t+/g, " ")]);
    else if (colon) pairs.push([colon[1], colon[2]]);
    else if (pairs.length) pairs[pairs.length - 1][1] += " " + line.trim();
  }
  for (const [k, v] of pairs) put(k, v);
  return { values, unknown, rows: 1 };
}
