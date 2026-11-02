/** Pure return (RMA) rules, shared by pages and actions. */

type Numeric = number | string | { toString(): string };
const n = (v: Numeric | null | undefined) => {
  if (v === null || v === undefined) return 0;
  const x = typeof v === "number" ? v : Number(v.toString());
  return Number.isFinite(x) ? x : 0;
};
const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export type SourceLine = { productId: string; quantity: Numeric; lineTotal: Numeric; taxAmount: Numeric };

/**
 * Price per unit the customer actually paid on the source invoice / sales
 * order: (taxable value + GST) / quantity, i.e. unit price after discount,
 * including GST. When a product appears on several lines the result is the
 * quantity-weighted average.
 */
export function unitPriceMap(lines: SourceLine[]): Map<string, number> {
  const acc = new Map<string, { amount: number; qty: number }>();
  for (const l of lines) {
    const a = acc.get(l.productId) ?? { amount: 0, qty: 0 };
    a.amount += n(l.lineTotal) + n(l.taxAmount);
    a.qty += n(l.quantity);
    acc.set(l.productId, a);
  }
  return new Map([...acc].filter(([, a]) => a.qty > 0).map(([id, a]) => [id, a.amount / a.qty]));
}

export type CreditLine = { productId: string; quantity: Numeric; receivedQty: Numeric };

/** Default credit: returned quantity × unit price, using received quantities once the goods are in. */
export function suggestedCredit(lines: CreditLine[], prices: Map<string, number>, received: boolean): number {
  return round2(lines.reduce((s, l) => s + n(received ? l.receivedQty : l.quantity) * (prices.get(l.productId) ?? 0), 0));
}

export type QcLine = { disposition: string; receivedQty: Numeric; repairedAt: Date | null };

/** Lines sent for repair that haven't been repaired (and restocked) yet. */
export function pendingRepairs(lines: QcLine[]): number {
  return lines.filter((l) => l.disposition === "REPAIR" && !l.repairedAt).length;
}

/** An inspected return can close once every repair line is done. */
export function closeBlocker(status: string, lines: QcLine[]): string | null {
  if (status !== "INSPECTED") return "Only inspected returns can be closed.";
  const pending = pendingRepairs(lines);
  if (pending > 0) return `${pending} line${pending === 1 ? " is" : "s are"} still awaiting repair.`;
  return null;
}

/** Remaining returnable quantity per product: sold minus already on other (non-cancelled) returns. */
export function remainingQty(sold: Map<string, number>, returned: Map<string, number>): Map<string, number> {
  return new Map([...sold].map(([id, q]) => [id, Math.max(0, q - (returned.get(id) ?? 0))]));
}
