import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { num } from "@/lib/format";

/** Items that can be manufactured: finished or semi-finished goods, or anything with a make supply mode. */
export const MANUFACTURED_WHERE: Prisma.ProductWhereInput = {
  type: "GOODS",
  OR: [{ itemType: { in: ["FINISHED_GOOD", "SEMI_FINISHED"] } }, { supplyMode: { in: ["MTS", "MTO", "ATO"] } }],
};

export type MfgProductOption = { id: string; sku: string; name: string; unit: string; purchasePrice: number; supplyMode: string };
export type MachineOption = { id: string; code: string; name: string; hourlyCost: number; status: string };

const productSelect = { id: true, sku: true, name: true, unit: true, purchasePrice: true, supplyMode: true } as const;

export async function getManufacturedOptions(includeId?: string | null): Promise<MfgProductOption[]> {
  const products = await db.product.findMany({
    where: includeId ? { OR: [{ ...MANUFACTURED_WHERE, isActive: true }, { id: includeId }] } : { ...MANUFACTURED_WHERE, isActive: true },
    orderBy: { name: "asc" },
    select: productSelect,
  });
  return products.map((p) => ({ ...p, purchasePrice: num(p.purchasePrice) }));
}

export async function getComponentOptions(includeIds: string[] = []): Promise<MfgProductOption[]> {
  const products = await db.product.findMany({
    where: { OR: [{ type: "GOODS", isActive: true }, { id: { in: includeIds } }] },
    orderBy: { name: "asc" },
    select: productSelect,
  });
  return products.map((p) => ({ ...p, purchasePrice: num(p.purchasePrice) }));
}

export async function getMachineOptions(): Promise<MachineOption[]> {
  const machines = await db.machine.findMany({
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, hourlyCost: true, status: true },
  });
  return machines.map((m) => ({ ...m, hourlyCost: num(m.hourlyCost) }));
}
