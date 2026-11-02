import "server-only";
import { db } from "@/lib/db";
import { num } from "@/lib/format";
import { getWarehouseOptions } from "@/lib/options";
import { getManufacturedOptions } from "../_lib/options";
import type { OrderBomOption } from "./order-form";

/** Dropdown data for the production order form. */
export async function getOrderFormData(opts: { productId?: string | null; bomId?: string | null; warehouseId?: string | null } = {}) {
  const [products, boms, warehouses] = await Promise.all([
    getManufacturedOptions(opts.productId),
    db.bom.findMany({
      where: { OR: [{ isActive: true }, ...(opts.bomId ? [{ id: opts.bomId }] : [])] },
      orderBy: [{ isDefault: "desc" }, { version: "desc" }],
      select: { id: true, productId: true, code: true, version: true, isDefault: true, outputQty: true },
    }),
    getWarehouseOptions({ includeId: opts.warehouseId }),
  ]);
  const bomOptions: OrderBomOption[] = boms.map((b) => ({ ...b, outputQty: num(b.outputQty) }));
  return { products, boms: bomOptions, warehouses };
}
