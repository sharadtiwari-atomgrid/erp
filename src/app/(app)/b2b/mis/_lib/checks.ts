/**
 * Data checks for a Domestic MIS row: warnings shown in the entry form and counted
 * in the list as "Needs attention". They never block saving. Pure.
 */
import { normalizeSelect, parseMisStatus, SELECT_ALIASES } from "@/lib/ops/lists";
import { OPTIONS, statusLabel, type MasterList, type MisValues } from "./fields";
import { hasFile, type MisFile } from "./files";
import { suggestName } from "./name-match";

export type Issue = { key: string; msg: string; fix?: string };
export type MasterNames = Partial<Record<MasterList, readonly string[]>>;

const MASTER_FIELDS: Array<[string, MasterList, string]> = [
  ["customer", "customers", "Customer"],
  ["supplier", "suppliers", "Supplier"],
  ["productName", "products", "Product"],
];

const num = (v: unknown) => {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
const has = (v: unknown) => !(v === null || v === undefined || String(v).trim() === "");
const started = (s: unknown) => s === "INTRANSIT" || s === "DELIVERED";

/** Lower-cased master names, built once per list for quick "is it in the master" checks. */
const sets = new WeakMap<readonly string[], Set<string>>();
function inList(list: readonly string[], v: string) {
  let s = sets.get(list);
  if (!s) {
    s = new Set(list.map((n) => n.trim().toLowerCase()));
    sets.set(list, s);
  }
  return s.has(v.toLowerCase());
}

/** [{ key, msg, fix? }]: fix is a value the form can set with one click. */
export function checkRow(r: Partial<MisValues>, masters: MasterNames = {}, docs: { pod?: MisFile[] | null } = {}): Issue[] {
  const out: Issue[] = [];
  for (const [key, listKey, label] of MASTER_FIELDS) {
    const v = String(r[key] ?? "").trim();
    const list = masters[listKey] ?? [];
    if (!v || !list.length || inList(list, v)) continue;
    const s = suggestName(v, list);
    out.push({
      key,
      msg: `Not in the ${label} master.${s ? ` Did you mean “${s}”?` : " Pick from the list, or add it to the master first."}`,
      fix: s ?? undefined,
    });
  }

  // Dropdown values the lists don't have (usually how a sheet wrote them).
  if (has(r.status) && !parseMisStatus(r.status) && !OPTIONS.status.includes(String(r.status)))
    out.push({ key: "status", msg: `“${r.status}” isn’t a status. Pick one from the list.` });
  for (const k of Object.keys(SELECT_ALIASES)) {
    const opts = OPTIONS[k] ?? [];
    const v = r[k];
    if (!has(v) || !opts.length || opts.includes(String(v))) continue;
    const to = normalizeSelect(k, String(v)) ?? "";
    const ok = opts.includes(to);
    out.push({ key: k, msg: `“${v}” isn’t in the list.${ok ? ` Use “${to}”.` : " Pick one from the list."}`, fix: ok ? to : undefined });
  }

  const q = num(r.quantityKgs);
  if (has(r.quantityKgs) && !(q !== null && q > 0)) out.push({ key: "quantityKgs", msg: "Quantity must be more than 0." });
  if (!has(r.quantityKgs) && started(r.status)) out.push({ key: "quantityKgs", msg: "Quantity is missing for a shipment that has left." });
  if (has(r.actualEtd) && has(r.actualEta) && String(r.actualEta) < String(r.actualEtd))
    out.push({ key: "actualEta", msg: "Actual ETA is before the actual ETD." });
  if (has(r.plannedEtd) && has(r.plannedEta) && String(r.plannedEta) < String(r.plannedEtd))
    out.push({ key: "plannedEta", msg: "Planned ETA is before the planned ETD." });
  if (started(r.status) && !has(r.actualEtd)) out.push({ key: "actualEtd", msg: `Status is ${statusLabel(r.status)} but there’s no actual ETD.` });
  if (r.status === "DELIVERED") {
    if (!has(r.actualEta)) out.push({ key: "actualEta", msg: "Delivered, but there’s no actual ETA." });
    if (!hasFile(docs.pod)) out.push({ key: "pod", msg: "Delivered, but the POD isn’t uploaded." });
  }
  const tot = num(r.totalLogisticsCost);
  const ag = num(r.logisticsCostAgToPay);
  if (tot !== null && ag !== null && ag > tot + 0.5)
    out.push({ key: "logisticsCostAgToPay", msg: "AG to pay is more than the total logistics cost." });
  if (has(r.customer) && has(r.supplier) && String(r.customer).trim().toLowerCase() === String(r.supplier).trim().toLowerCase())
    out.push({ key: "customer", msg: "Customer and supplier are the same." });
  return out;
}
