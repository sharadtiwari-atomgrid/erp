/**
 * Purchase invoice lines: item lines (a product, posted to Purchases) or
 * expense / asset lines (posted to a ledger account). Pure and client-safe.
 */

import { computeDocument } from "@/lib/totals";

export type BillLine = {
  kind: "item" | "expense";
  productId: string | null;
  glAccountId: string | null;
  description: string | null;
  hsnCode: string | null;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  taxRate: number;
};

/** Line totals and document totals, using the same rounding as every other document. */
export function computeBill(lines: BillLine[]) {
  const doc = computeDocument(
    lines.map((l) => ({
      productId: l.productId ?? "",
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discountPct: l.discountPct,
      taxRate: l.taxRate,
    })),
  );
  return {
    lines: lines.map((l, i) => ({ ...l, lineTotal: doc.lines[i].lineTotal, taxAmount: doc.lines[i].taxAmount, position: i })),
    subtotal: doc.subtotal,
    taxTotal: doc.taxTotal,
    total: doc.total,
  };
}

/** Error message for an invalid line set, or null. */
export function checkBillLines(lines: BillLine[]): string | null {
  if (lines.length === 0) return "Add at least one line.";
  for (const [i, l] of lines.entries()) {
    const n = i + 1;
    if (l.kind === "item" && !l.productId) return `Line ${n}: choose an item.`;
    if (l.kind === "expense" && !l.glAccountId) return `Line ${n}: choose a ledger account.`;
    if (!(l.quantity > 0)) return `Line ${n}: quantity must be more than zero.`;
    if (l.unitPrice < 0) return `Line ${n}: rate cannot be negative.`;
    if (l.discountPct < 0 || l.discountPct > 100) return `Line ${n}: discount must be between 0 and 100.`;
    if (l.taxRate < 0 || l.taxRate > 100) return `Line ${n}: GST rate must be between 0 and 100.`;
  }
  return null;
}

/**
 * Quantity still to bill on each PO line: received − already billed. Billed
 * quantities are per product and are used up by the PO's lines in order.
 */
export function unbilledPoQuantities(
  poLines: Array<{ id: string; productId: string; receivedQty: number }>,
  billedByProduct: Map<string, number>,
): Map<string, number> {
  const left = new Map(billedByProduct);
  const out = new Map<string, number>();
  for (const l of poLines) {
    const billed = left.get(l.productId) ?? 0;
    const used = Math.min(billed, l.receivedQty);
    left.set(l.productId, billed - used);
    out.set(l.id, Math.round((l.receivedQty - used) * 1000) / 1000);
  }
  return out;
}
