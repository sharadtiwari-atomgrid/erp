/** Amount formatting for finance reports (safe on the client). */

const nf = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 1,23,456.00; negatives in brackets; zero as a dash unless `zero` is given. */
export function amt(n: number, opts: { zero?: string; dash?: boolean } = {}): string {
  const v = Math.round(n * 100) / 100;
  if (Math.abs(v) < 0.005) return opts.zero ?? "–";
  return v < 0 ? `(${nf.format(-v)})` : nf.format(v);
}

/** Class for an amount cell: red when negative. */
export function amtClass(n: number): string {
  return n < -0.004 ? "text-red-600" : "";
}

/** Round to paise for spreadsheet cells. */
export const cell = (n: number) => Math.round(n * 100) / 100;
