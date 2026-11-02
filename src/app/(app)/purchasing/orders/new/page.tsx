import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { num, toDateInput } from "@/lib/format";
import { param } from "@/lib/forms";
import { getProductOptions, getSupplierOptions, getWarehouseOptions } from "@/lib/options";
import type { LineInput } from "@/lib/totals";
import { getOnHandByProduct } from "@/app/(app)/inventory/_components/stock";
import { createPurchaseOrder } from "../actions";
import { PurchaseOrderForm } from "../order-form";

export const metadata: Metadata = { title: "New purchase order" };

/**
 * Lines for `?productIds=a,b` (the stock page's Reorder action). Suggests
 * enough to bring each product up to twice its reorder level.
 */
async function reorderLines(productIds: string[]): Promise<LineInput[]> {
  if (productIds.length === 0) return [];
  const [products, onHand] = await Promise.all([
    db.product.findMany({
      where: { id: { in: productIds }, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, type: true, purchasePrice: true, taxRate: true, reorderLevel: true },
    }),
    getOnHandByProduct(productIds),
  ]);
  return products.map((p) => {
    const reorderLevel = num(p.reorderLevel);
    const shortfall = Math.ceil(reorderLevel * 2 - (onHand.get(p.id) ?? 0));
    return {
      productId: p.id,
      quantity: p.type === "GOODS" && reorderLevel > 0 ? Math.max(1, shortfall) : 1,
      unitPrice: num(p.purchasePrice),
      discountPct: 0,
      taxRate: num(p.taxRate),
    };
  });
}

export default async function NewPurchaseOrderPage({ searchParams }: PageProps<"/purchasing/orders/new">) {
  await requireUser("purchaseOrders", "edit");
  const sp = await searchParams;
  const productIds = param(sp, "productIds").split(",").filter(Boolean);
  const [suppliers, warehouses, products, lines] = await Promise.all([
    getSupplierOptions(),
    getWarehouseOptions(),
    getProductOptions(),
    reorderLines(productIds),
  ]);

  return (
    <div className="max-w-5xl">
      <PageHeader title="New purchase order" back={{ href: "/purchasing/orders", label: "Purchase orders" }} />
      <PurchaseOrderForm
        action={createPurchaseOrder}
        suppliers={suppliers}
        warehouses={warehouses}
        products={products}
        cancelHref="/purchasing/orders"
        initial={{
          supplierId: param(sp, "supplierId"),
          warehouseId: warehouses[0]?.id ?? "",
          orderDate: toDateInput(new Date()),
          expectedDate: "",
          notes: null,
          lines,
        }}
      />
    </div>
  );
}
