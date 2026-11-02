import type { Role } from "@/generated/prisma/enums";
import { can } from "@/lib/permissions";

/** Goods can be received by purchasing staff and by warehouse staff who manage stock. */
export function canReceiveGoods(role: Role): boolean {
  return can(role, "purchaseOrders", "edit") || can(role, "stock", "edit");
}
