import "server-only";
import { db } from "@/lib/db";
import { num } from "@/lib/format";
import type { ProductOption } from "@/components/line-items-editor";

/** Dropdown data shared by document forms. Only active records are returned. */

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

export async function getCustomerOptions() {
  return db.customer.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, state: true, paymentTermsDays: true },
  });
}

export async function getSupplierOptions() {
  return db.supplier.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, paymentTermsDays: true },
  });
}

export async function getWarehouseOptions() {
  return db.warehouse.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true },
  });
}

export async function getCompany() {
  return (await db.companySettings.findUnique({ where: { id: 1 } })) ?? { name: "My Company", currency: "INR", state: null } as const;
}
