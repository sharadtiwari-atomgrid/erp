/** Shared labels for cash management and fixed assets (client-safe). */

export const ASSET_CATEGORIES = ["Buildings", "Plant & machinery", "Furniture & fixtures", "Vehicles", "Office equipment", "Computers", "Other"] as const;

export const METHOD_LABELS: Record<string, string> = { SLM: "Straight line (SLM)", WDV: "Written-down value (WDV)" };

/** Display for a signed amount: negatives in brackets. */
export function bracket(n: number, fmt: (n: number) => string): string {
  return n < 0 ? `(${fmt(-n)})` : fmt(n);
}
