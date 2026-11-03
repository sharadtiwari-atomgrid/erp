/**
 * Product Master sheet → the product names used across Domestic B2B. The sheet
 * (Product ID, Product Name, Inward Name, Outward Name, Product Type, CAS No.,
 * Atomgrid HSN Code, Product Funnel) is the authority: every product name in use
 * is matched to one of its products, and the user confirms the renames. Pure.
 */

export type SheetProduct = { code: string; name: string; type: string; casNo: string; hsn: string; funnel: string; aliases: string[] };
export type MatchKind = "exact" | "case" | "alias" | "ambiguous" | "close" | "unknown";
export type Match = { kind: MatchKind; to: string; options: string[] };

const cell = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const hk = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Loose key: letters, digits, % . + only, case ignored ("Sample  Technical" = "SAMPLE TECHNICAL"). */
export const nameKey = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9%.+]/g, "");

const COLS = {
  code: ["productid", "id", "sno"],
  name: ["productname", "moleculename", "name"],
  inward: ["inwardname"],
  outward: ["outwardname"],
  type: ["producttype", "type"],
  cas: ["casno", "cas"],
  hsn: ["atomgridhsncode", "hsncode", "hsn"],
  funnel: ["productfunnel", "funnel"],
} as const;
type Col = keyof typeof COLS;

/** Rows of cells → sheet products. Throws when there's no "Product Name" header in the first 10 rows. */
export function parseProductMaster(aoa: unknown[][]): SheetProduct[] {
  const rows = aoa || [];
  const hr = rows.slice(0, 10).findIndex((r) => (r || []).some((c) => hk(c) === "productname"));
  if (hr < 0) throw new Error("No “Product Name” column found.");
  const h = rows[hr].map(hk);
  const col = Object.fromEntries(
    (Object.entries(COLS) as Array<[Col, readonly string[]]>).map(([k, keys]) => [k, keys.map((x) => h.indexOf(x)).find((i) => i >= 0) ?? -1]),
  ) as Record<Col, number>;
  const get = (r: unknown[], k: Col) => (col[k] >= 0 ? cell(r[col[k]]) : "");
  const out: SheetProduct[] = [];
  const seen = new Set<string>();
  for (const raw of rows.slice(hr + 1)) {
    const r = raw || [];
    const name = get(r, "name");
    if (!name || seen.has(nameKey(name))) continue;
    seen.add(nameKey(name));
    const aliases = [
      ...new Set(
        [get(r, "inward"), get(r, "outward")]
          .flatMap((v) => v.split("|"))
          .map(cell)
          .filter((a) => a && nameKey(a) !== nameKey(name)),
      ),
    ];
    out.push({ code: get(r, "code"), name, type: get(r, "type"), casNo: get(r, "cas").replace(/^[-–]$/, ""), hsn: get(r, "hsn"), funnel: get(r, "funnel"), aliases });
  }
  return out;
}

/** Token synonyms for "close" suggestions only: technical / tech / tc read alike, WDG = WG, PPT = precipitated. */
export const TOKEN_SYNONYMS: Record<string, string> = { technical: "tech", tech: "tech", tc: "tech", wdg: "wg", ppt: "precipitated", pptd: "precipitated" };

/** Words for fuzzy matching; "18.30%" = "18.3%", "11.0" = "11". */
export function tokens(s: unknown): string[] {
  return String(s ?? "")
    .toLowerCase()
    .replace(/(\d+)\.0+(?!\d)/g, "$1")
    .replace(/(\d+\.\d*?)0+%/g, "$1%")
    .replace(/\.%/g, "%")
    .split(/[^a-z0-9%.]+/)
    .filter(Boolean)
    .map((t) => TOKEN_SYNONYMS[t] || t);
}

function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** Two tokens match when equal, or (6+ letters) within 1 edit (2 edits for 10+ letters). */
const same = (x: string, y: string) => x === y || (x.length >= 6 && y.length >= 6 && lev(x, y) <= (Math.min(x.length, y.length) >= 10 ? 2 : 1));

/** Share of matching tokens (Dice coefficient), 0–1. */
export function score(a: string, b: string): number {
  const A = tokens(a), B = tokens(b);
  if (!A.length || !B.length) return 0;
  const used = new Set<number>();
  let hit = 0;
  for (const x of A) {
    const j = B.findIndex((y, i) => !used.has(i) && same(x, y));
    if (j >= 0) {
      used.add(j);
      hit++;
    }
  }
  return (2 * hit) / (A.length + B.length);
}

/**
 * products → match(name):
 *   exact     — already the sheet's name
 *   case      — same name, different capitals / spacing → rename to the sheet's
 *   alias     — one of a product's Inward / Outward names → rename to that product
 *   ambiguous — an alias of several products → pick one (options)
 *   close     — not in the sheet, but very like one product (score ≥ 0.8 and 0.1 ahead of the next) → confirm
 *   unknown   — nothing close (options: the nearest few)
 */
export function productMatcher(products: ReadonlyArray<Pick<SheetProduct, "name" | "aliases">>) {
  const byKey = new Map(products.map((p) => [nameKey(p.name), p.name]));
  const byAlias = new Map<string, string[]>();
  for (const p of products)
    for (const a of p.aliases || []) {
      const k = nameKey(a);
      if (!byKey.has(k)) byAlias.set(k, [...new Set([...(byAlias.get(k) || []), p.name])]);
    }
  return (name: string): Match => {
    const k = nameKey(name);
    if (!k) return { kind: "unknown", to: "", options: [] };
    const direct = byKey.get(k);
    if (direct !== undefined) return { kind: direct === cell(name) ? "exact" : "case", to: direct, options: [direct] };
    const alias = byAlias.get(k);
    if (alias) return alias.length === 1 ? { kind: "alias", to: alias[0], options: alias } : { kind: "ambiguous", to: "", options: alias };
    const ranked = products
      .map((p) => ({ n: p.name, s: Math.max(score(name, p.name), ...(p.aliases || []).map((a) => score(name, a))) }))
      .filter((x) => x.s > 0.4)
      .sort((a, b) => b.s - a.s);
    const best = ranked[0], second = ranked[1];
    if (best && best.s >= 0.8 && (!second || best.s - second.s >= 0.1)) return { kind: "close", to: best.n, options: ranked.slice(0, 5).map((x) => x.n) };
    return { kind: "unknown", to: "", options: ranked.slice(0, 5).map((x) => x.n) };
  };
}

/** Sheet "Product Type" → the product class picklist. */
export function classOf(type: string): string | null {
  const t = type.trim().toLowerCase();
  if (!t) return null;
  if (/^tech/.test(t)) return "Technical";
  if (/^formul/.test(t)) return "Formulation";
  if (/^intermed/.test(t)) return "Intermediate";
  return "Other";
}

/** Sheet "Product Funnel" → B2B / B2C (else null). */
export function funnelOf(funnel: string): string | null {
  const f = funnel.trim().toUpperCase().replace(/\s+/g, "");
  return f === "B2B" || f === "B2C" ? f : null;
}

export type NameInUse = { name: string; master: boolean; mis: number; po: number; inward: number; outward: number };
