import "server-only";
import { db } from "@/lib/db";
import { num } from "@/lib/format";
import { formatDmy, isoFromDay } from "@/lib/ops/dates";
import type { DepreciableAsset } from "./depreciation";

type Numeric = { toString(): string } | number | null;

/** A FixedAsset row → the plain shape the depreciation maths uses. */
export function toDepreciable(a: {
  cost: Numeric;
  salvageValue: Numeric;
  method: string;
  usefulLifeYears: Numeric;
  ratePct: Numeric;
  accumulatedDepreciation: Numeric;
  acquisitionDate: Date;
  depreciatedTo: Date | null;
}): DepreciableAsset {
  return {
    cost: num(a.cost),
    salvageValue: num(a.salvageValue),
    method: a.method,
    usefulLifeYears: a.usefulLifeYears === null ? null : num(a.usefulLifeYears),
    ratePct: a.ratePct === null ? null : num(a.ratePct),
    accumulatedDepreciation: num(a.accumulatedDepreciation),
    acquisitionDate: isoFromDay(a.acquisitionDate),
    depreciatedTo: a.depreciatedTo ? isoFromDay(a.depreciatedTo) : null,
  };
}

/** Branches and posted purchase invoices for the asset form. */
export async function assetFormOptions() {
  const [branches, invoices] = await Promise.all([
    db.branch.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.purchaseInvoice.findMany({
      where: { status: { in: ["POSTED", "PARTIALLY_PAID", "PAID"] } },
      orderBy: { invoiceDate: "desc" },
      take: 300,
      select: { id: true, number: true, supplierInvoiceNo: true, invoiceDate: true, total: true, supplier: { select: { name: true } } },
    }),
  ]);
  return {
    branches,
    invoices: invoices.map((i) => ({
      id: i.id,
      label: `${i.number}${i.supplierInvoiceNo ? ` (${i.supplierInvoiceNo})` : ""} · ${i.supplier.name} · ${formatDmy(i.invoiceDate)} · ₹${num(i.total).toLocaleString("en-IN")}`,
    })),
  };
}

export type RegisterFilter = { q?: string; category?: string; status?: string; branchId?: string };

/** Asset register rows for the list page and the Excel export. */
export async function assetRegister(f: RegisterFilter) {
  const assets = await db.fixedAsset.findMany({
    where: {
      ...(f.q && {
        OR: [
          { name: { contains: f.q, mode: "insensitive" } },
          { code: { contains: f.q, mode: "insensitive" } },
          { location: { contains: f.q, mode: "insensitive" } },
        ],
      }),
      ...(f.category && { category: f.category }),
      ...(f.status === "ACTIVE" || f.status === "DISPOSED" ? { status: f.status } : {}),
      ...(f.branchId && { branchId: f.branchId }),
    },
    orderBy: { code: "asc" },
    take: 2000,
    include: { branch: { select: { name: true } } },
  });
  return assets.map((a) => {
    const cost = num(a.cost);
    const accumulated = num(a.accumulatedDepreciation);
    return { ...a, costN: cost, accumulatedN: accumulated, bookValue: a.status === "DISPOSED" ? 0 : cost - accumulated };
  });
}
