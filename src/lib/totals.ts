/** Line + document totals shared by quotations, orders, invoices and POs. Safe to import on the client. */

export type LineInput = {
  productId: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  discountPct: number;
  taxRate: number;
};

export type ComputedLine = LineInput & { lineTotal: number; taxAmount: number; position: number };

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function computeLine(line: LineInput): { lineTotal: number; taxAmount: number } {
  const gross = line.quantity * line.unitPrice;
  const lineTotal = round2(gross * (1 - line.discountPct / 100));
  const taxAmount = round2((lineTotal * line.taxRate) / 100);
  return { lineTotal, taxAmount };
}

export function computeDocument(lines: LineInput[]) {
  const computed: ComputedLine[] = lines.map((line, position) => ({ ...line, ...computeLine(line), position }));
  const subtotal = round2(computed.reduce((s, l) => s + l.lineTotal, 0));
  const taxTotal = round2(computed.reduce((s, l) => s + l.taxAmount, 0));
  return { lines: computed, subtotal, taxTotal, total: round2(subtotal + taxTotal) };
}

/**
 * Indian GST split: intra-state supplies are taxed as CGST + SGST (half each),
 * inter-state supplies as IGST. Falls back to CGST/SGST when a state is unknown.
 */
export function splitGst(taxTotal: number, companyState?: string | null, placeOfSupply?: string | null) {
  const interState =
    !!companyState && !!placeOfSupply && companyState.trim().toLowerCase() !== placeOfSupply.trim().toLowerCase();
  if (interState) return { interState, cgst: 0, sgst: 0, igst: round2(taxTotal) };
  const half = round2(taxTotal / 2);
  return { interState, cgst: half, sgst: round2(taxTotal - half), igst: 0 };
}
