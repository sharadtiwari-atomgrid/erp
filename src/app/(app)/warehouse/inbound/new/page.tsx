import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getBranchScope } from "@/lib/branch";
import { db } from "@/lib/db";
import { num, toDateInput } from "@/lib/format";
import { getSupplierOptions, getWarehouseOptions } from "@/lib/options";
import { createInbound } from "../actions";
import { GrnForm } from "./grn-form";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "New GRN" };

export default async function NewInboundPage() {
  await requireUser("inbound", "edit");
  const scope = await getBranchScope();
  const [suppliers, warehouses, products] = await Promise.all([
    getSupplierOptions(),
    getWarehouseOptions({ branchId: scope.branchId }),
    db.product.findMany({
      where: { type: "GOODS", isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true, unit: true, purchasePrice: true, qcRequired: true },
    }),
  ]);

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="New GRN"
        description="Record goods received without a purchase order. To receive against a PO, use Receive goods on the purchase order."
        back={{ href: "/warehouse/inbound", label: "Inbound" }}
      />
      <GrnForm
        action={createInbound}
        suppliers={suppliers}
        warehouses={warehouses}
        products={products.map((p) => ({ ...p, purchasePrice: num(p.purchasePrice) }))}
        today={toDateInput(new Date())}
        defaultWarehouseId={warehouses.length === 1 ? warehouses[0].id : ""}
      />
    </div>
  );
}
