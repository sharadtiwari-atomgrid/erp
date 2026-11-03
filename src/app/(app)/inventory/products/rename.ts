import "server-only";
import type { Tx } from "@/lib/db";

/**
 * Domestic B2B records store product names as text. A renamed product's new
 * name is written (exact matches only) onto Fresh PO `product`, MIS
 * `productName` and the batch registers' AG catalogue name.
 */
export type ProductRenameCounts = { freshPo: number; misJob: number; batchInward: number; batchOutward: number };

export async function renameProductEverywhere(tx: Tx, from: string, to: string): Promise<ProductRenameCounts> {
  const po = await tx.freshPo.updateMany({ where: { product: from }, data: { product: to } });
  const mis = await tx.misJob.updateMany({ where: { productName: from }, data: { productName: to } });
  const inward = await tx.batchInward.updateMany({ where: { catalogueName: from }, data: { catalogueName: to } });
  const outward = await tx.batchOutward.updateMany({ where: { catalogueName: from }, data: { catalogueName: to } });
  return { freshPo: po.count, misJob: mis.count, batchInward: inward.count, batchOutward: outward.count };
}

export function describeProductRename(c: ProductRenameCounts): string {
  const parts = [
    [c.misJob, "Domestic MIS job"],
    [c.freshPo, "Fresh PO"],
    [c.batchInward, "batch inward line"],
    [c.batchOutward, "batch outward line"],
  ] as const;
  const used = parts.filter(([n]) => n > 0).map(([n, l]) => `${n} ${l}${n === 1 ? "" : "s"}`);
  return used.length ? `Renamed on ${used.join(", ")}.` : "The old name wasn't used on any Domestic B2B record.";
}
