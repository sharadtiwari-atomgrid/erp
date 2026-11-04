import "server-only";
import { db } from "@/lib/db";
import { getPostingAccountOptions } from "@/lib/finance/queries";
import { num } from "@/lib/format";
import { getBranchOptions, getCompany } from "@/lib/options";

/** Suppliers and transporters (active, plus `includeId`), for bills and vendor payments. */
export async function getPayeeOptions(includeId?: string | null) {
  const rows = await db.contact.findMany({
    where: {
      roles: { hasSome: ["SUPPLIER", "TRANSPORTER"] },
      ...(includeId ? { OR: [{ isActive: true }, { id: includeId }] } : { isActive: true }),
    },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, state: true, paymentTermsDays: true, roles: true, pan: true, gstin: true },
  });
  return rows.map((r) => ({ ...r, transporter: r.roles.includes("TRANSPORTER") && !r.roles.includes("SUPPLIER") }));
}

/** Everything the purchase invoice form needs. */
export async function getBillFormOptions(opts: { supplierId?: string | null; branchId?: string | null } = {}) {
  const [suppliers, branches, products, accounts, company] = await Promise.all([
    getPayeeOptions(opts.supplierId),
    getBranchOptions(opts.branchId),
    db.product.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true, unit: true, purchasePrice: true, taxRate: true, hsnCode: true },
    }),
    getPostingAccountOptions({ journalOnly: true }),
    getCompany(),
  ]);
  return {
    suppliers: suppliers.map(({ id, code, name, state, paymentTermsDays, transporter }) => ({ id, code, name, state, paymentTermsDays, transporter })),
    branches,
    products: products.map((p) => ({ ...p, purchasePrice: num(p.purchasePrice), taxRate: num(p.taxRate) })),
    accounts: accounts.filter((a) => a.type === "EXPENSE" || a.type === "ASSET").map((a) => ({ id: a.id, code: a.code, name: a.name, type: a.type as string })),
    companyState: company.state ?? null,
  };
}
