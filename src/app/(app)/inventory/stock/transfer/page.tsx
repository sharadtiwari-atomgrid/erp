import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getWarehouseOptions } from "@/lib/options";
import { getStockLevelMap } from "../../_components/stock";
import { transferStock } from "../actions";
import { TransferStockForm } from "./transfer-form";

export const metadata: Metadata = { title: "Transfer stock" };

export default async function TransferStockPage() {
  await requireUser("stock", "edit");
  const [warehouses, products, levels] = await Promise.all([
    getWarehouseOptions(),
    db.product.findMany({
      where: { type: "GOODS", isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true, unit: true },
    }),
    getStockLevelMap(),
  ]);

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Transfer stock"
        description="Move stock between warehouses. Both sides are posted to the ledger in one step."
        back={{ href: "/inventory/stock", label: "Stock on hand" }}
      />
      <TransferStockForm action={transferStock} warehouses={warehouses} products={products} levels={levels} />
    </div>
  );
}
