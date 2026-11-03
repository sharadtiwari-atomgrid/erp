/**
 * Master-name matching for the MIS checks: the batch-inventory library's port of the
 * source's AGEngine (`norm` + SequenceMatcher-style `ratio`, threshold 0.78), with a
 * small cache because the list check runs for every row. Pure.
 */
import { norm, ratio, suggestName as suggest } from "@/lib/batch-inventory/engine";

export { norm, ratio };

const cache = new Map<string, string | null>();

/** Closest master name: the same normalised spelling first, else the best spelling match above 0.78. */
export function suggestName(value: string, list: readonly string[]): string | null {
  const key = `${value}\u0000${list.length}\u0000${list[0] ?? ""}\u0000${list[list.length - 1] ?? ""}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const best = suggest(value, list, 0.78);
  if (cache.size > 5000) cache.clear();
  cache.set(key, best);
  return best;
}
