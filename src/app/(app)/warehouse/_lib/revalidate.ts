import "server-only";
import { revalidatePath } from "next/cache";

/** Revalidates every page that shows stock figures. */
export function revalidateStockPages(productIds: string[] = []) {
  revalidatePath("/inventory/stock");
  revalidatePath("/inventory/movements");
  revalidatePath("/inventory/products");
  revalidatePath("/inventory/warehouses", "layout");
  for (const id of new Set(productIds)) revalidatePath(`/inventory/products/${id}`);
  revalidatePath("/dashboard");
}

export function revalidateInbound(id?: string, purchaseOrderId?: string | null) {
  revalidatePath("/warehouse/inbound");
  if (id) revalidatePath(`/warehouse/inbound/${id}`, "layout");
  if (purchaseOrderId) {
    revalidatePath("/purchasing/orders");
    revalidatePath(`/purchasing/orders/${purchaseOrderId}`);
  }
}

export function revalidateOutbound(opts: { id?: string; salesOrderId?: string | null; sessionId?: string | null } = {}) {
  revalidatePath("/warehouse/outbound");
  revalidatePath("/warehouse/picking");
  if (opts.id) revalidatePath(`/warehouse/outbound/${opts.id}`, "layout");
  if (opts.sessionId) revalidatePath(`/warehouse/picking/${opts.sessionId}`);
  if (opts.salesOrderId) {
    revalidatePath("/sales/orders");
    revalidatePath(`/sales/orders/${opts.salesOrderId}`);
  }
}
