import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { NameCheck } from "./name-check";
import type { NameInUse } from "./product-names";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Product name check" };

/** Every product name in use: the product master, Domestic MIS, Fresh PO, and batch inward / outward (catalogue name, else product name). */
async function namesInUse(): Promise<NameInUse[]> {
  const [products, mis, po, inward, outward] = await Promise.all([
    db.product.findMany({ select: { name: true } }),
    db.misJob.groupBy({ by: ["productName"], where: { deletedAt: null, productName: { not: null } }, _count: { _all: true } }),
    db.freshPo.groupBy({ by: ["product"], where: { deletedAt: null, product: { not: null } }, _count: { _all: true } }),
    db.batchInward.groupBy({ by: ["catalogueName", "productName"], where: { deletedAt: null }, _count: { _all: true } }),
    db.batchOutward.groupBy({ by: ["catalogueName", "productName"], where: { deletedAt: null }, _count: { _all: true } }),
  ]);
  const m = new Map<string, NameInUse>();
  const row = (name: string) => {
    let r = m.get(name);
    if (!r) m.set(name, (r = { name, master: false, mis: 0, po: 0, inward: 0, outward: 0 }));
    return r;
  };
  for (const p of products) row(p.name).master = true;
  for (const r of mis) if (r.productName?.trim()) row(r.productName).mis += r._count._all;
  for (const r of po) if (r.product?.trim()) row(r.product).po += r._count._all;
  for (const r of inward) {
    const n = r.catalogueName?.trim() ? r.catalogueName : r.productName;
    if (n?.trim()) row(n).inward += r._count._all;
  }
  for (const r of outward) {
    const n = r.catalogueName?.trim() ? r.catalogueName : r.productName;
    if (n?.trim()) row(n).outward += r._count._all;
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export default async function ProductNameCheckPage() {
  const user = await requireUser("products");
  const names = await namesInUse();
  return (
    <>
      <PageHeader
        title="Product name check"
        description="Upload the Product Master sheet. Every product name used across the product master and Domestic B2B is matched to one of its products: you decide what each becomes, then apply."
        back={{ href: "/inventory/products", label: "Items" }}
      />
      <NameCheck names={names} canApply={can(user, "products", "edit")} />
    </>
  );
}
