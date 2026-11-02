import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { getBranchScope } from "@/lib/branch";
import { db } from "@/lib/db";

/**
 * Vehicles and drivers may be unassigned to a branch (shared fleet). In a
 * branch scope, show that branch's records plus the shared ones.
 */
export async function fleetBranchWhere(): Promise<{ OR?: Array<{ branchId: string | null }> }> {
  const { branchId } = await getBranchScope();
  return branchId ? { OR: [{ branchId }, { branchId: null }] } : {};
}

export async function getVehicleOptions(opts: { includeId?: string | null; excludeInactive?: boolean } = {}) {
  const scope = await fleetBranchWhere();
  const where: Prisma.VehicleWhereInput = {
    AND: [scope, opts.excludeInactive ? { OR: [{ status: { not: "INACTIVE" } }, ...(opts.includeId ? [{ id: opts.includeId }] : [])] } : {}],
  };
  return db.vehicle.findMany({
    where,
    orderBy: { registrationNo: "asc" },
    select: { id: true, registrationNo: true, type: true, status: true, transporterId: true },
  });
}

export async function getDriverOptions(includeId?: string | null) {
  const scope = await fleetBranchWhere();
  return db.driver.findMany({
    where: { AND: [scope, { OR: [{ isActive: true }, ...(includeId ? [{ id: includeId }] : [])] }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true, phone: true },
  });
}
