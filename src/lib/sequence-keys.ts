/** Document number formats, keyed by sequence. Kept free of server-only imports so the seed can use it. */
export const SEQUENCES = {
  CONTACT: { prefix: "C-", padding: 5 },
  QUOTATION: { prefix: "QT-", padding: 5 },
  SALES_ORDER: { prefix: "SO-", padding: 5 },
  INVOICE: { prefix: "INV-", padding: 5 },
  PURCHASE_ORDER: { prefix: "PO-", padding: 5 },
  STOCK_ADJUSTMENT: { prefix: "ADJ-", padding: 5 },
  STOCK_TRANSFER: { prefix: "TRF-", padding: 5 },
  INBOUND: { prefix: "GRN-", padding: 5 },
  OUTBOUND: { prefix: "OUT-", padding: 5 },
  PICKING: { prefix: "PICK-", padding: 5 },
  PACKING: { prefix: "PACK-", padding: 5 },
  HANDLING_UNIT: { prefix: "HU-", padding: 6 },
  BOM: { prefix: "BOM-", padding: 4 },
  PRODUCTION_ORDER: { prefix: "MO-", padding: 5 },
  PRODUCTION_BATCH: { prefix: "BATCH-", padding: 5 },
  TRIP: { prefix: "TRIP-", padding: 5 },
  ASN: { prefix: "ASN-", padding: 5 },
  DELIVERY_NOTE: { prefix: "DN-", padding: 5 },
  RETURN: { prefix: "RMA-", padding: 5 },
} as const;

export type SequenceKey = keyof typeof SEQUENCES;
