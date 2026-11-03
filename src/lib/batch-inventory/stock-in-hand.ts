/**
 * Batch inventory → Stock in Hand: worked out from Inward and Outward, nothing entered.
 * Per batch line: stock = Net Weight − Outward Qty (the sheet's figure + dispatches entered
 * in the ERP), packs left, value at the purchase rate, ageing and expiry; netted per material
 * in byMaterial. Plus a dispatch planner, the data checks behind the figures, and the
 * comparison with a warehouse stock statement. Pure functions.
 */
import { labelDate, num, r3, withCalc, type Calculated, type InwardEntry } from "./inward";
import { allocate, batchKey, isPlaceholderBatch, looseBatch, sheetDifferences, withOutward, type OutwardEntry, type WithOutward } from "./outward";

const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
export const materialOf = (r: { catalogueName?: string | null; productName?: string | null }) => String(r.catalogueName || r.productName || "—").trim();

export const AGE_BANDS = [
  { key: "0-30", label: "0–30 days", max: 30 },
  { key: "31-90", label: "31–90 days", max: 90 },
  { key: "91-180", label: "91–180 days", max: 180 },
  { key: "180+", label: "Over 180 days", max: Infinity },
] as const;
export type AgeBand = (typeof AGE_BANDS)[number]["key"] | "unknown";
export const ageBand = (a: number | null | undefined): AgeBand => (a === null || a === undefined ? "unknown" : AGE_BANDS.find((b) => a <= b.max)!.key);
export const EXPIRY = { expired: "Expired", soon: "Expires within 90 days", ok: "In date", unknown: "No expiry date" } as const;
export type ExpiryClass = keyof typeof EXPIRY;

export type StockLine = InwardEntry &
  WithOutward &
  Calculated & {
    instockQty: number;
    material: string;
    futureInward: boolean;
    packSize: number | null;
    packs: number | null;
    value: number | null;
    expIso: string | null;
    mfgIso: string | null;
    toExpiry: number | null;
    expiry: ExpiryClass;
    band: AgeBand;
  };

/** Inward + Outward → batch lines still holding stock (or negative), with everything worked out. */
export function stockLines(inward: InwardEntry[], outward: OutwardEntry[], today: string): StockLine[] {
  return withOutward(inward, outward)
    .map((r) => withCalc(r, today))
    .filter((r) => r.instockQty !== null && Math.abs(r.instockQty) > 0.0005)
    .map((r) => {
      const instockQty = r.instockQty as number;
      const net = num(r.netWeight);
      const units = num(r.units);
      const rate = num(r.purchaseRate);
      const pack = net && units ? net / units : null;
      const exp = labelDate(r.expDate, true);
      const mfg = labelDate(r.mfgDate, false);
      const toExpiry = exp ? days(today, exp) : null;
      const future = !!(r.inwardDate && r.inwardDate > today);
      const ageing = future ? null : r.ageing; // an inward date in the future has no age yet (see the checks)
      return {
        ...r,
        instockQty,
        material: materialOf(r),
        ageing,
        futureInward: future,
        packSize: pack === null ? null : r3(pack),
        packs: pack ? Math.round((instockQty / pack) * 100) / 100 : null,
        value: rate !== null ? Math.round(instockQty * rate) : null,
        expIso: exp || null,
        mfgIso: mfg || null,
        toExpiry,
        expiry: toExpiry === null ? "unknown" : toExpiry < 0 ? "expired" : toExpiry <= 90 ? "soon" : "ok",
        band: ageBand(ageing),
      } satisfies StockLine;
    });
}

export type MaterialRow = {
  material: string;
  type: string;
  hsn: string;
  license: string;
  stock: number;
  value: number | null;
  valuedKg: number;
  avgRate: number | null;
  packs: number | null;
  batches: number;
  lines: StockLine[];
  warehouses: string[];
  byWh: Record<string, number>;
  expiredKg: number;
  soonKg: number;
  oldest: number | null;
  nextExpiry: string | null;
};

/** Batch lines → one row per material (AG Catalogue Name, else Product Name), most stock first. */
export function byMaterial(lines: StockLine[]): MaterialRow[] {
  type Acc = Omit<MaterialRow, "warehouses" | "value" | "valuedKg" | "avgRate" | "batches" | "packs"> & {
    warehouses: Set<string>;
    value: number;
    valued: number;
    packs: number;
    packed: boolean;
  };
  const m = new Map<string, Acc>();
  for (const l of lines) {
    const o: Acc = m.get(l.material) || {
      material: l.material, type: l.type || "", hsn: l.hsn || "", license: l.license || "", stock: 0, value: 0, valued: 0, packs: 0, packed: false,
      lines: [], warehouses: new Set(), byWh: {}, expiredKg: 0, soonKg: 0, oldest: null, nextExpiry: null,
    };
    o.stock += l.instockQty;
    o.lines.push(l);
    if (l.location) o.warehouses.add(l.location);
    if (l.instockQty > 0) {
      const w = l.location || "—";
      o.byWh[w] = r3((o.byWh[w] || 0) + l.instockQty);
      if (l.expiry === "expired") o.expiredKg += l.instockQty;
      else if (l.expiry === "soon") o.soonKg += l.instockQty;
    }
    if (l.value !== null) {
      o.value += l.value;
      o.valued += l.instockQty;
    }
    if (l.packs !== null) {
      o.packs += l.packs;
      o.packed = true;
    }
    if (l.instockQty > 0 && l.ageing !== null && (o.oldest === null || l.ageing > o.oldest)) o.oldest = l.ageing;
    if (l.instockQty > 0 && l.expIso && (!o.nextExpiry || l.expIso < o.nextExpiry)) o.nextExpiry = l.expIso;
    m.set(l.material, o);
  }
  return [...m.values()]
    .map((o) => ({
      material: o.material, type: o.type, hsn: o.hsn, license: o.license, lines: o.lines, byWh: o.byWh, oldest: o.oldest, nextExpiry: o.nextExpiry,
      stock: r3(o.stock),
      expiredKg: r3(o.expiredKg),
      soonKg: r3(o.soonKg),
      packs: o.packed ? Math.round(o.packs * 100) / 100 : null,
      value: o.valued > 0 ? Math.round(o.value) : null,
      valuedKg: r3(o.valued),
      batches: o.lines.filter((l) => l.instockQty > 0.0005).length,
      warehouses: [...o.warehouses],
      avgRate: o.valued > 0 ? Math.round((o.value / o.valued) * 100) / 100 : null,
    }))
    .sort((a, b) => b.stock - a.stock);
}

export type PickRule = "fifo" | "fefo";
export type Pick = { line: StockLine; take: number; packs: number | null };

/**
 * Plan a dispatch: which batches to take for `qty` kg of a material.
 *   "fifo" — oldest inward first; "fefo" — earliest expiry first (no expiry date last).
 * Expired batches are left out unless `includeExpired`. Returns { picks, short, available }.
 */
export function planPick(
  lines: StockLine[],
  { material, qty, warehouse = "", rule = "fifo", includeExpired = false }: { material: string; qty: unknown; warehouse?: string; rule?: PickRule; includeExpired?: boolean },
): { picks: Pick[]; short: number; available: number } {
  const want = num(qty) || 0;
  const pool = lines.filter(
    (l) => l.material === material && l.instockQty > 0.0005 && (!warehouse || l.location === warehouse) && (includeExpired || l.expiry !== "expired"),
  );
  const key = (l: StockLine) => (rule === "fefo" ? [l.expIso || "9999-12-31", l.inwardDate || ""] : [l.inwardDate || "9999-12-31", l.expIso || "9999-12-31"]);
  pool.sort((a, b) => {
    const [a1, a2] = key(a);
    const [b1, b2] = key(b);
    return a1.localeCompare(b1) || a2.localeCompare(b2) || String(a.batchNo).localeCompare(String(b.batchNo));
  });
  const available = r3(pool.reduce((s, l) => s + l.instockQty, 0));
  const picks: Pick[] = [];
  let left = want;
  for (const l of pool) {
    if (left <= 0.0005) break;
    const take = r3(Math.min(left, l.instockQty));
    picks.push({ line: l, take, packs: l.packSize ? Math.round((take / l.packSize) * 100) / 100 : null });
    left = r3(left - take);
  }
  return { picks, short: left > 0.0005 ? left : 0, available };
}

export type CheckLevel = "bad" | "warn" | "info";
export type CheckRow = { id: string; material: string; batchNo: string; location?: string; grnNo?: string; inwardDate?: string; qty: number | null; note?: string };
export type StockCheck = { key: string; level: CheckLevel; title: string; help: string; rows: CheckRow[]; kg: number };

/**
 * What to look at behind the figures. `lines` = stockLines(...). Only checks with rows are
 * returned, worst first.
 */
export function stockChecks(inward: InwardEntry[], outward: OutwardEntry[], lines: StockLine[], today: string): StockCheck[] {
  const pos = lines.filter((l) => l.instockQty > 0);
  const line = (l: { id?: string; material?: string; catalogueName?: string; productName?: string; batchNo: string; location: string; grnNo: string; inwardDate: string; instockQty: number | null }): CheckRow => ({
    id: String(l.id ?? ""), material: l.material || materialOf(l), batchNo: l.batchNo, location: l.location, grnNo: l.grnNo, inwardDate: l.inwardDate, qty: l.instockQty,
  });
  const out: StockCheck[] = [];
  const add = (key: string, level: CheckLevel, title: string, help: string, rows: CheckRow[]) => {
    if (rows.length) out.push({ key, level, title, help, rows, kg: r3(rows.reduce((a, r) => a + (num(r.qty) || 0), 0)) });
  };

  add("negative", "bad", "More dispatched than received",
    "The material's total Outward Qty is more than its total Net Weight — a receipt missing from Inward, or a dispatch entered against the wrong material.",
    byMaterial(lines).filter((m) => m.stock < -0.0005).map((m) => ({
      id: m.material, material: m.material, batchNo: m.lines.filter((l) => l.instockQty < 0).map((l) => l.batchNo).join(", "), location: m.warehouses.join(", "), qty: m.stock, note: `${m.lines.length} batch lines`,
    })));
  const { unmatched } = allocate(inward, outward);
  add("unmatched", "bad", "Dispatches not taken off any stock",
    "Entered in Outward, but the batch number matches no Inward line of that material (or is “N.A” / blank) — the stock still counts this quantity.",
    unmatched.map((o) => ({ id: String(o.id ?? ""), material: o.catalogueName || o.productName, batchNo: o.batchNo || "(blank)", location: o.warehouse, grnNo: o.grnNo, inwardDate: o.obDate, qty: num(o.qty), note: o.customer })));
  add("future", "warn", "Inward date in the future", "No ageing can be worked out until the date is corrected.",
    inward.filter((r) => r.inwardDate && r.inwardDate > today).map((r) => ({ ...line({ ...r, instockQty: num(r.netWeight) }), note: `Job ${r.jobNo || "—"}` })));
  add("nobatch", "warn", "Stock without a batch number", "“N.A” or blank — it can't be dispatched against or matched to a count.",
    pos.filter((l) => isPlaceholderBatch(l.batchNo)).map(line));
  const mats = new Map<string, Set<string>>();
  for (const l of pos) {
    if (isPlaceholderBatch(l.batchNo)) continue;
    const k = batchKey(l.batchNo);
    const s = mats.get(k) || new Set<string>();
    s.add(l.material);
    mats.set(k, s);
  }
  add("shared", "warn", "One batch number, more than one material", "Check the batch was typed against the right product.",
    pos.filter((l) => !isPlaceholderBatch(l.batchNo) && mats.get(batchKey(l.batchNo))!.size > 1).map(line));
  add("sheet", "warn", "Inward Outward Qty ≠ outward sheet",
    "The Inward sheet's Outward Qty for the batch is more (or less) than its dispatches on the Outward sheet plus moves between our warehouses. Stock follows the Inward sheet.",
    sheetDifferences(inward, outward).map((d) => ({
      id: d.batchNo, material: d.productName, batchNo: d.batchNo, qty: d.diff,
      note: `Inward says ${d.inwardOutward} out · Outward lines ${d.outwardLines}${d.transferred ? ` · moved ${d.transferred} (GRN ${d.transfers.map((t) => t.grnNo).join(", ")})` : ""}`,
    })));
  add("expmfg", "warn", "Expiry on or before manufacture", "One of the two dates is mistyped.",
    pos.filter((l) => l.expIso && l.mfgIso && l.expIso <= l.mfgIso).map((l) => ({ ...line(l), note: `Mfg ${l.mfgDate} · Exp ${l.expDate}` })));
  add("noexp", "info", "No expiry date", "Not counted in the expiry figures; FEFO plans take these last.",
    pos.filter((l) => !l.expIso).map((l) => ({ ...line(l), note: l.expDate ? `Exp “${l.expDate}” isn't a date` : "" })));
  add("nopack", "info", "No pack count", "Units is blank, so packs can't be worked out.", pos.filter((l) => l.packs === null).map(line));
  add("norate", "info", "No purchase rate", "Left out of the stock value.", pos.filter((l) => l.value === null).map(line));
  const order = { bad: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

/* ---------------- comparison with a warehouse stock statement ---------------- */

export type CountCompareRow = { key: string; material: string; batchNo: string; locations: string[]; crm: number; counted: number | null; diff: number; status: "same" | "more" | "less" | "crmOnly" | "countOnly" };

/**
 * The simpler batch-by-batch comparison with a physical count: matched by batch number
 * (letters and digits only), or by material for lines without a real batch.
 */
export function compareCount(lines: StockLine[], counted: CountedLine[]): { rows: CountCompareRow[]; crm: number; counted: number; matched: number } {
  const keyOf = (batch: string, name: string) => (isPlaceholderBatch(batch) ? "~" + nameKey(name) : batchKey(batch));
  type O = { key: string; material: string; batchNo: string; crm: number; counted: number | null; locations: Set<string> };
  const m = new Map<string, O>();
  for (const l of lines) {
    if (Math.abs(l.instockQty) < 0.0005) continue;
    const k = keyOf(l.batchNo, l.material);
    const o = m.get(k) || { key: k, material: l.material, batchNo: l.batchNo, crm: 0, counted: null, locations: new Set<string>() };
    o.crm += l.instockQty;
    if (l.location) o.locations.add(l.location);
    m.set(k, o);
  }
  for (const c of counted) {
    const k = keyOf(c.batch, c.name);
    const o = m.get(k) || { key: k, material: c.name, batchNo: c.batch, crm: 0, counted: null, locations: new Set<string>() };
    o.counted = (o.counted || 0) + (num(c.qty) || 0);
    m.set(k, o);
  }
  const rows: CountCompareRow[] = [...m.values()]
    .map((o) => {
      const crm = r3(o.crm);
      const cnt = o.counted === null ? null : r3(o.counted);
      const diff = r3((cnt ?? 0) - crm);
      const status: CountCompareRow["status"] = cnt === null ? "crmOnly" : crm === 0 && cnt > 0 ? "countOnly" : Math.abs(diff) < 0.01 ? "same" : diff > 0 ? "more" : "less";
      return { key: o.key, material: o.material, batchNo: o.batchNo, locations: [...o.locations], crm, counted: cnt, diff, status };
    })
    .filter((r) => !(r.status === "crmOnly" && r.crm <= 0) && !(r.counted === 0 && r.crm === 0));
  const order = { less: 0, more: 1, crmOnly: 2, countOnly: 3, same: 4 };
  rows.sort((a, b) => order[a.status] - order[b.status] || Math.abs(b.diff) - Math.abs(a.diff));
  const tot = (f: (r: CountCompareRow) => number) => r3(rows.reduce((a, r) => a + f(r), 0));
  return { rows, crm: tot((r) => Math.max(0, r.crm)), counted: tot((r) => r.counted || 0), matched: rows.filter((r) => r.status === "same").length };
}

const nameKey = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
// Product names: generic words ignored, "ppt" read as "precipitated".
const GENERIC = new Set(["technical", "tech", "tc", "grade", "material", "the"]);
const SAME_WORD: Record<string, string> = { ppt: "precipitated", pptd: "precipitated" };
const words = (s: unknown) =>
  String(s ?? "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9%.+]+/g, " ").split(" ").filter((w) => w && !GENERIC.has(w)).map((w) => SAME_WORD[w] || w);

/** Share of words two product names have in common (long words match on their first 6 letters); 1 when identical. */
export function nameScore(a: unknown, b: unknown): number {
  const A = words(a);
  const B = words(b);
  if (!A.length || !B.length) return 0;
  if (A.join("") === B.join("")) return 1;
  const near = (x: string, y: string) => x === y || (x.length > 5 && y.length > 5 && (x.startsWith(y.slice(0, 6)) || y.startsWith(x.slice(0, 6))));
  const hit = A.filter((x) => B.some((y) => near(x, y))).length;
  return hit / Math.max(A.length, B.length);
}
/** Every word of the shorter name is in the longer one ("TOPRAMEZONE" ⊂ "Topramezone 33.6% SC"). */
const within = (a: string, b: string) => {
  const [S, L] = words(a).length <= words(b).length ? [words(a), words(b)] : [words(b), words(a)];
  return S.length > 0 && S.join("").length >= 6 && S.every((x) => L.includes(x));
};

export type CountedLine = { name: string; batch: string; qty: number | null };
type Known = { batchNo: string; productName?: string; catalogueName?: string; material?: string };

/**
 * Puts a warehouse line ({ name, batch }) on the ERP material it belongs to: by its batch number
 * (typing differences allowed), else by its product name (score ≥ 0.75, or every word of the
 * shorter name in the longer one). null when nothing fits. `inward` supplies every name the ERP knows.
 */
export function countMatcher(lines: StockLine[], inward: Known[] = []): (c: { name: string; batch?: string }) => string | null {
  const live = lines.filter((l) => Math.abs(l.instockQty) > 0.0005);
  const known: (Known & { material: string })[] = [...live, ...inward.map((r) => ({ ...r, material: materialOf(r) }))];
  // batch → { material → its names }; a batch number can be on more than one product, then the name picks which.
  const byBatch = new Map<string, Map<string, Set<string>>>();
  for (const l of known) {
    const k = looseBatch(l.batchNo);
    if (!k || isPlaceholderBatch(l.batchNo)) continue;
    const mats = byBatch.get(k) || new Map<string, Set<string>>();
    byBatch.set(k, mats);
    const ns = mats.get(l.material) || new Set([l.material]);
    mats.set(l.material, ns);
    if (l.productName) ns.add(l.productName);
  }
  const ofBatch = (mats: Map<string, Set<string>>, name: string) => {
    const first = mats.keys().next().value as string;
    if (mats.size === 1) return first;
    let best = first;
    let score = -1;
    for (const [m, ns] of mats)
      for (const n of ns) {
        const s = nameKey(n) === nameKey(name) ? 2 : nameScore(name, n);
        if (s > score) {
          score = s;
          best = m;
        }
      }
    return best;
  };
  const names = new Map<string, string>(); // known name → material
  for (const l of known) for (const n of [l.material, l.productName]) if (n && !names.has(n)) names.set(n, l.material);
  const nameCache = new Map<string, string | null>();
  return (c) => {
    const k = looseBatch(c.batch);
    if (k && !isPlaceholderBatch(c.batch) && byBatch.has(k)) return ofBatch(byBatch.get(k)!, c.name);
    if (nameCache.has(c.name)) return nameCache.get(c.name)!;
    let best: string | null = null;
    let score = 0;
    for (const [n, m] of names) {
      const s = nameScore(c.name, n);
      if (s > score) {
        score = s;
        best = m;
      }
    }
    let m = score >= 0.75 ? best : null;
    if (!m) {
      const hits = new Set([...names].filter(([n]) => within(c.name, n)).map(([, mm]) => mm));
      if (hits.size === 1) m = [...hits][0];
    }
    nameCache.set(c.name, m);
    return m;
  };
}

export type CompareStatus = "less" | "more" | "crmOnly" | "countOnly" | "renamed" | "named" | "same";
export type CompareBatch = { batchNo: string; countBatch?: string; crm: number; counted: number | null; diff: number; status: CompareStatus; pair?: string };
export type CompareRow = { material: string; crm: number; counted: number; diff: number; status: CompareStatus; countNames: string[]; batches: CompareBatch[]; pair?: string };

/**
 * The ERP's stock against a warehouse stock statement (warehouse MIS "Stock in Hand" tab, a PSV,
 * or the tracker's Instock tab), compared on quantity per material with the batches underneath.
 * Within a material, a batch only the ERP has and one only the count has, of the same quantity,
 * is the same stock with its batch written differently ("renamed"); across materials, the same
 * quantity under another name is "named".
 */
export function compareStock(lines: StockLine[], counted: CountedLine[], inward: Known[] = []): { rows: CompareRow[]; crm: number; counted: number; matched: number } {
  const live = lines.filter((l) => Math.abs(l.instockQty) > 0.0005);
  const materialFor = countMatcher(lines, inward);
  type B = { batchNo: string; countBatch?: string; crm: number; counted: number | null };
  type M = { material: string; crm: number; counted: number; inCount: boolean; inCrm: boolean; countNames: Set<string>; batches: Map<string, B> };
  const mats = new Map<string, M>();
  const mat = (m: string) => {
    let o = mats.get(m);
    if (!o) mats.set(m, (o = { material: m, crm: 0, counted: 0, inCount: false, inCrm: false, countNames: new Set(), batches: new Map() }));
    return o;
  };
  const batch = (o: M, b: string) => {
    const k = isPlaceholderBatch(b) ? "~" : looseBatch(b);
    let x = o.batches.get(k);
    if (!x) o.batches.set(k, (x = { batchNo: b, crm: 0, counted: null }));
    return x;
  };
  for (const l of live) {
    const o = mat(l.material);
    o.crm += l.instockQty;
    o.inCrm = true;
    batch(o, l.batchNo).crm += l.instockQty;
  }
  for (const c of counted) {
    const q = num(c.qty);
    if (!q) continue;
    const m = materialFor(c) || c.name;
    const o = mat(m);
    o.counted += q;
    o.inCount = true;
    if (nameKey(c.name) !== nameKey(m)) o.countNames.add(c.name);
    const b = batch(o, c.batch);
    b.counted = (b.counted || 0) + q;
    if (!b.countBatch) b.countBatch = c.batch;
  }
  const bOrder: Record<CompareStatus, number> = { less: 0, more: 1, crmOnly: 2, countOnly: 3, renamed: 4, named: 5, same: 6 };
  const rows: CompareRow[] = [...mats.values()]
    .map((o) => {
      const bs: (CompareBatch & { status?: CompareStatus })[] = [...o.batches.values()]
        .map((b) => ({ ...b, crm: r3(b.crm), counted: b.counted === null ? null : r3(b.counted), diff: r3((b.counted || 0) - b.crm), status: undefined as unknown as CompareStatus }))
        .filter((b) => Math.abs(b.crm) > 0.0005 || b.counted);
      const missing = bs.filter((b) => b.crm > 0 && !b.counted);
      const extra = bs.filter((b) => b.counted && Math.abs(b.crm) < 0.0005);
      for (const a of missing) {
        const e = extra.find((x) => !x.pair && Math.abs((x.counted ?? 0) - a.crm) < 0.01);
        if (e) {
          a.status = e.status = "renamed";
          a.pair = e.batchNo;
          e.pair = a.batchNo;
        }
      }
      for (const b of bs)
        if (!b.status) b.status = Math.abs(b.diff) < 0.01 ? "same" : !b.counted ? "crmOnly" : Math.abs(b.crm) < 0.0005 ? "countOnly" : b.diff > 0 ? "more" : "less";
      const crm = r3(o.crm);
      const cnt = r3(o.counted);
      const diff = r3(cnt - crm);
      const status: CompareStatus = Math.abs(diff) < 0.01 ? "same" : !o.inCount ? "crmOnly" : !o.inCrm ? "countOnly" : diff > 0 ? "more" : "less";
      bs.sort((a, b) => bOrder[a.status] - bOrder[b.status] || Math.abs(b.diff) - Math.abs(a.diff));
      return { material: o.material, crm, counted: cnt, diff, status, countNames: [...o.countNames], batches: bs as CompareBatch[] };
    })
    .filter((r) => r.crm > 0.0005 || r.counted > 0.0005 || r.status !== "same");
  for (const a of rows) {
    if (a.status === "named" || !(a.crm > 0 && !a.counted)) continue;
    const b = rows.find((x) => x.status !== "named" && Math.abs(x.crm) < 0.0005 && x.counted > 0 && Math.abs(x.counted - a.crm) < 0.01);
    if (b) {
      a.status = b.status = "named";
      a.pair = b.material;
      b.pair = a.material;
    }
  }
  const order: Record<CompareStatus, number> = { less: 0, more: 1, crmOnly: 2, countOnly: 3, named: 4, renamed: 5, same: 6 };
  rows.sort((a, b) => order[a.status] - order[b.status] || Math.abs(b.diff) - Math.abs(a.diff));
  const tot = (f: (r: CompareRow) => number) => r3(rows.reduce((a, r) => a + f(r), 0));
  return { rows, crm: tot((r) => r.crm), counted: tot((r) => r.counted), matched: rows.filter((r) => r.status === "same" || r.status === "named").length };
}
