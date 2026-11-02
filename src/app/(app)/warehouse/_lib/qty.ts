/** Quantity helpers. Quantities are stored with 3 decimals; compare with a small tolerance. Safe on the client. */

export const EPSILON = 0.0005;

export const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

/** Reads a non-negative quantity from a form field; blank means 0. Returns null when invalid. */
export function readQty(formData: FormData, name: string): number | null {
  const raw = String(formData.get(name) ?? "").trim();
  if (raw === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return round3(n);
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
