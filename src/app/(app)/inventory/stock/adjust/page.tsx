import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { param } from "@/lib/forms";
import { getWarehouseOptions } from "@/lib/options";
import { getStockLevelMap } from "../../_components/stock";
import { adjustStockLevel } from "../actions";
import { AdjustStockForm } from "./adjust-form";

export const metadata: Metadata = { title: "Adjust stock" };

export default async function AdjustStockPage({ searchParams }: PageProps<"/inventory/stock/adjust">) {
  await requireUser("stock", "edit");
  const sp = await searchParams;
  const [warehouses, products, levels] = await Promise.all([
    getWarehouseOptions(),
    db.product.findMany({
      where: { type: "GOODS", isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true, unit: true },
    }),
    getStockLevelMap(),
  ]);
  const warehouseId = param(sp, "warehouseId") || (warehouses.length === 1 ? warehouses[0].id : "");

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Adjust stock"
        description="Correct on-hand quantity after a count, damage or loss. Every adjustment is recorded in the stock ledger."
        back={{ href: "/inventory/stock", label: "Stock on hand" }}
      />
      <AdjustStockForm
        action={adjustStockLevel}
        warehouses={warehouses}
        products={products}
        levels={levels}
        initial={{ productId: param(sp, "productId"), warehouseId }}
      />
    </div>
  );
}
