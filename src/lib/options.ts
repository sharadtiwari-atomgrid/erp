import "server-only";
import { db } from "@/lib/db";
import { num } from "@/lib/format";
import type { ContactRole } from "@/generated/prisma/enums";
import type { ProductOption } from "@/components/line-items-editor";

/**
 * Dropdown data shared by document forms. Only active records are returned,
 * plus `includeId` when given, so editing a document whose contact or
 * warehouse was later deactivated still shows its current value.
 */

const activeOr = (includeId?: string | null) => (includeId ? { OR: [{ isActive: true }, { id: includeId }] } : { isActive: true });

export async function getProductOptions(): Promise<ProductOption[]> {
  const products = await db.product.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, sku: true, name: true, unit: true, salePrice: true, purchasePrice: true, taxRate: true },
  });
  return products.map((p) => ({
    ...p,
    salePrice: num(p.salePrice),
    purchasePrice: num(p.purchasePrice),
    taxRate: num(p.taxRate),
  }));
}

export async function getContactOptions(role: ContactRole, includeId?: string | null) {
  return db.contact.findMany({
    where: { roles: { has: role }, ...activeOr(includeId) },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, state: true, paymentTermsDays: true },
  });
}

export const getCustomerOptions = (includeId?: string | null) => getContactOptions("CUSTOMER", includeId);
export const getSupplierOptions = (includeId?: string | null) => getContactOptions("SUPPLIER", includeId);
export const getTransporterOptions = (includeId?: string | null) => getContactOptions("TRANSPORTER", includeId);

/** Warehouses, limited to one branch when `branchId` is given. */
export async function getWarehouseOptions(opts: { branchId?: string | null; includeId?: string | null } = {}) {
  return db.warehouse.findMany({
    where: { ...activeOr(opts.includeId), ...(opts.branchId && { branchId: opts.branchId }) },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, branchId: true },
  });
}

export async function getBranchOptions(includeId?: string | null) {
  return db.branch.findMany({ where: activeOr(includeId), orderBy: { name: "asc" }, select: { id: true, code: true, name: true } });
}

export async function getCompany() {
  return db.companySettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
}
