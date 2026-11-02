import { can, type Principal } from "@/lib/permissions";

/** Goods can be received by purchasing staff and by warehouse staff who handle inbound. */
export function canReceiveGoods(user: Principal): boolean {
  return can(user, "purchaseOrders", "edit") || can(user, "inbound", "edit");
}
