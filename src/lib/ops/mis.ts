import "server-only";
import type { Tx } from "@/lib/db";
import type { FreshPo } from "@/generated/prisma/client";
import { recordChange } from "@/lib/audit";
import { lockSerial, nextJobNo } from "@/lib/ops/serials";

/**
 * Creates (or returns) the Domestic MIS job for a Fresh PO that is ready for
 * operations. Idempotent: a PO already linked to a live job returns that job.
 * Pickup / drop pincodes come from the supplier / customer contact.
 * Call inside a transaction.
 */
export async function createMisJobFromFreshPo(tx: Tx, po: FreshPo, userId: string | null) {
  if (po.misJobId) {
    const existing = await tx.misJob.findFirst({ where: { id: po.misJobId, deletedAt: null } });
    if (existing) return existing;
  }
  await lockSerial(tx, "mis");
  const jobNo = await nextJobNo(tx);

  const [supplier, customer] = await Promise.all([
    po.supplier ? tx.contact.findFirst({ where: { name: { equals: po.supplier, mode: "insensitive" } }, select: { pincode: true } }) : null,
    po.customer ? tx.contact.findFirst({ where: { name: { equals: po.customer, mode: "insensitive" } }, select: { pincode: true } }) : null,
  ]);

  const job = await tx.misJob.create({
    data: {
      jobNo,
      status: "FRESH_PO",
      source: "fresh-po",
      poDate: po.poDate,
      supplier: po.supplier,
      customer: po.customer,
      productName: po.product,
      quantityKgs: po.qtyToDispatch ?? po.poQty,
      hsCode: po.hsnCode,
      batchNo: po.batchNo,
      packing: po.packaging,
      agSupplyPoc: po.agSupplyPoc,
      agDemandPoc: po.demandPoc,
      supplyPoc: po.supplyPoc,
      pickupAddress: po.pickupAddress,
      pickupPincode: supplier?.pincode ?? null,
      dropAddress: po.deliveryAddress,
      dropPincode: customer?.pincode ?? null,
      customerPocDetails: po.customerPoc,
      logisticsType: po.logisticsType,
      logisticsPaymentTerm: po.logisticsPaymentTerm,
      originType: po.originType,
      movementType: po.movementType,
      taxableValue: po.totalTaxable,
      blockersRemarks: po.notes,
    },
  });
  await tx.freshPo.update({ where: { id: po.id }, data: { board: "MIS", misJobId: job.id } });
  await recordChange(
    { userId, entityType: "MisJob", entityId: job.id, action: "created", message: `Job ${jobNo} created from Fresh PO #${po.requestNo ?? "—"}` },
    tx,
  );
  return job;
}
