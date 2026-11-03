import "server-only";
import { db } from "@/lib/db";
import { num } from "@/lib/format";
import { isoFromDay } from "@/lib/ops/dates";
import type { TransportJob } from "@/lib/ops/transport";

/** A MisJob as plain data for the transport Client Components (dates as YYYY-MM-DD, amounts as numbers). */
export type PlainTransportJob = TransportJob & {
  jobNo: string;
  status: string | null;
  quantityKgs: number | null;
  totalLogisticsCost: number | null;
  logisticsCostAgToPay: number | null;
  transportPaidSoFar: number | null;
  taxableValue: number | null;
  distanceApprox: number | null;
  plannedEtd: string;
  plannedEta: string;
  actualEtd: string;
  actualEta: string;
  hasPod: boolean;
};

export type TransporterContact = { name: string; gstin: string | null; phone: string | null; email: string | null; contactPerson: string | null };
export type PlaceContact = { name: string; pincode: string | null; address: string | null; roles: string[] };

const dec = (v: { toString(): string } | null) => (v === null ? null : num(v));

/** Live (not deleted) Domestic MIS jobs with a POD flag. */
export async function loadTransportJobs(): Promise<PlainTransportJob[]> {
  const [jobs, pods] = await Promise.all([
    db.misJob.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true, jobNo: true, status: true, customer: true, supplier: true, quantityKgs: true,
        plannedEtd: true, plannedEta: true, actualEtd: true, actualEta: true,
        pickupAddress: true, pickupPincode: true, dropAddress: true, dropPincode: true,
        vehicleType: true, transporterDetails: true, totalLogisticsCost: true, logisticsCostAgToPay: true,
        logisticsPaymentTerm: true, distanceApprox: true, taxableValue: true,
        transportPaymentStatus: true, transportPaidSoFar: true,
      },
    }),
    db.opsFile.findMany({ where: { entityType: "MisJob", field: "pod" }, select: { entityId: true }, distinct: ["entityId"] }),
  ]);
  const withPod = new Set(pods.map((p) => p.entityId));
  return jobs.map((j) => ({
    ...j,
    quantityKgs: dec(j.quantityKgs),
    totalLogisticsCost: dec(j.totalLogisticsCost),
    logisticsCostAgToPay: dec(j.logisticsCostAgToPay),
    transportPaidSoFar: dec(j.transportPaidSoFar),
    taxableValue: dec(j.taxableValue),
    distanceApprox: dec(j.distanceApprox),
    plannedEtd: isoFromDay(j.plannedEtd),
    plannedEta: isoFromDay(j.plannedEta),
    actualEtd: isoFromDay(j.actualEtd),
    actualEta: isoFromDay(j.actualEta),
    hasPod: withPod.has(j.id),
  }));
}

/** Contacts with the Transporter role (the Transport Master). */
export async function loadTransporters(): Promise<TransporterContact[]> {
  return db.contact.findMany({
    where: { roles: { has: "TRANSPORTER" } },
    orderBy: { name: "asc" },
    select: { name: true, gstin: true, phone: true, email: true, contactPerson: true },
  });
}

/** Customer / supplier contacts used to turn names and towns into pincodes. */
export async function loadPlaces(): Promise<PlaceContact[]> {
  const rows = await db.contact.findMany({
    where: { roles: { hasSome: ["CUSTOMER", "SUPPLIER"] } },
    orderBy: { name: "asc" },
    select: { name: true, pincode: true, billingAddress: true, shippingAddress: true, city: true, roles: true },
  });
  return rows.map((c) => ({
    name: c.name,
    pincode: c.pincode,
    address: [c.billingAddress, c.shippingAddress, c.city].filter(Boolean).join(" ") || null,
    roles: c.roles,
  }));
}
