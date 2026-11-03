/**
 * Batch lookup for the Domestic MIS batch picker: the batches in stock, and whether a
 * typed batch number is one of them (with a "did you mean" for typing slips like O for 0
 * or a missing digit). Ported from the source's Domestic MIS rules. Pure.
 */
import { r3 } from "./inward";
import { batchKey } from "./outward";

export type BatchInStock = { batchNo: string; key: string; material: string; productName: string; locations: string[]; stock: number };
export type BatchCheck = { batchNo: string; found: BatchInStock | null; suggestion: BatchInStock | null; otherProduct: boolean };

const loose = (b: unknown) => batchKey(b).replace(/O/g, "0").replace(/(^|[A-Z])0+(?=\d)/g, "$1");
const nk = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

function dist(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Stock lines (stockLines / loadStockLines) → one entry per batch with stock. */
export function batchesInStock(lines: { batchNo: string; material: string; productName: string; location: string; instockQty: number }[]): BatchInStock[] {
  const m = new Map<string, Omit<BatchInStock, "locations"> & { locations: Set<string> }>();
  for (const l of lines) {
    const k = batchKey(l.batchNo);
    if (!k) continue;
    const o = m.get(k) || { batchNo: l.batchNo, key: k, material: l.material, productName: l.productName, locations: new Set<string>(), stock: 0 };
    o.stock += l.instockQty;
    if (l.location) o.locations.add(l.location);
    m.set(k, o);
  }
  return [...m.values()].map((o) => ({ ...o, stock: r3(o.stock), locations: [...o.locations] })).filter((o) => o.stock > 0.0005);
}

/** Does this batch belong to that product? (names compared loosely, either way round) */
export const sameProduct = (b: { material?: string; productName?: string }, product: unknown) => {
  const p = nk(product);
  if (!p) return true;
  return [b.material, b.productName].some((n) => {
    const x = nk(n);
    return !!x && (x.includes(p) || p.includes(x));
  });
};

/**
 * Check the batch(es) typed on a shipment ("B1, B2") against stock. found: the stock entry;
 * suggestion: a near match in stock for this product when not found (or the loose match found);
 * otherProduct: found but under another material.
 */
export function checkBatches(text: unknown, product: unknown, batches: BatchInStock[]): BatchCheck[] {
  const byKey = new Map(batches.map((b) => [b.key, b]));
  return String(text || "")
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((batchNo) => {
      const k = batchKey(batchNo);
      const found = byKey.get(k) || batches.find((b) => loose(b.batchNo) === loose(batchNo)) || null;
      if (found) return { batchNo, found, suggestion: found.key !== k ? found : null, otherProduct: !sameProduct(found, product) };
      const near = batches
        .filter((b) => sameProduct(b, product))
        .map((b) => ({ b, d: dist(k, b.key) }))
        .filter((x) => x.d <= 2)
        .sort((a, b) => a.d - b.d)[0];
      return { batchNo, found: null, suggestion: near ? near.b : null, otherProduct: false };
    });
}

/** kg available across the batches typed (found ones only). */
export const availableKg = (checks: BatchCheck[]) => r3(checks.reduce((a, c) => a + (c.found ? c.found.stock : 0), 0));
