/**
 * Batch lookup for the Batch No. field (batches in stock, "did you mean", over-stock):
 * the helpers live in the batch-inventory library; re-exported here for the MIS form.
 * Pure and client-safe.
 */
export { availableKg, batchesInStock, checkBatches, sameProduct, type BatchCheck, type BatchInStock } from "@/lib/batch-inventory/batches";
export { batchKey } from "@/lib/batch-inventory/outward";
