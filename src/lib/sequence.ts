import "server-only";
import type { Tx } from "@/lib/db";

export const SEQUENCES = {
  CUSTOMER: { prefix: "CUS-", padding: 4 },
  SUPPLIER: { prefix: "SUP-", padding: 4 },
  QUOTATION: { prefix: "QT-", padding: 5 },
  SALES_ORDER: { prefix: "SO-", padding: 5 },
  INVOICE: { prefix: "INV-", padding: 5 },
  PURCHASE_ORDER: { prefix: "PO-", padding: 5 },
  STOCK_ADJUSTMENT: { prefix: "ADJ-", padding: 5 },
  STOCK_TRANSFER: { prefix: "TRF-", padding: 5 },
} as const;

export type SequenceKey = keyof typeof SEQUENCES;

/** Atomically reserves the next document number, e.g. "SO-00042". Call inside a transaction. */
export async function nextDocumentNumber(tx: Tx, key: SequenceKey): Promise<string> {
  const def = SEQUENCES[key];
  const seq = await tx.documentSequence.upsert({
    where: { key },
    create: { key, prefix: def.prefix, padding: def.padding, next: 2 },
    update: { next: { increment: 1 } },
  });
  const value = seq.next - 1;
  return `${seq.prefix}${String(value).padStart(seq.padding, "0")}`;
}
