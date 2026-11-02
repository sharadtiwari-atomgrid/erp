import type { Role } from "@/generated/prisma/enums";

/**
 * Module-level access control. Each module lists the roles that may view it
 * and the roles that may create/edit records in it. ADMIN can do everything.
 */
export const MODULES = {
  dashboard: { view: "all", edit: [] },
  customers: { view: ["MANAGER", "SALES", "VIEWER"], edit: ["MANAGER", "SALES"] },
  leads: { view: ["MANAGER", "SALES", "VIEWER"], edit: ["MANAGER", "SALES"] },
  quotations: { view: ["MANAGER", "SALES", "VIEWER"], edit: ["MANAGER", "SALES"] },
  salesOrders: { view: ["MANAGER", "SALES", "WAREHOUSE", "VIEWER"], edit: ["MANAGER", "SALES"] },
  invoices: { view: ["MANAGER", "SALES", "VIEWER"], edit: ["MANAGER", "SALES"] },
  products: { view: "all", edit: ["MANAGER", "PURCHASE", "WAREHOUSE"] },
  warehouses: { view: "all", edit: ["MANAGER", "WAREHOUSE"] },
  stock: { view: "all", edit: ["MANAGER", "WAREHOUSE"] },
  suppliers: { view: ["MANAGER", "PURCHASE", "WAREHOUSE", "VIEWER"], edit: ["MANAGER", "PURCHASE"] },
  purchaseOrders: { view: ["MANAGER", "PURCHASE", "WAREHOUSE", "VIEWER"], edit: ["MANAGER", "PURCHASE"] },
  settings: { view: [], edit: [] },
} as const satisfies Record<string, { view: "all" | readonly Role[]; edit: readonly Role[] }>;

export type Module = keyof typeof MODULES;
export type Access = "view" | "edit";

export function can(role: Role, module: Module, access: Access = "view"): boolean {
  if (role === "ADMIN") return true;
  const rule = MODULES[module][access];
  if (rule === "all") return true;
  return (rule as readonly Role[]).includes(role);
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  MANAGER: "Manager",
  SALES: "Sales",
  PURCHASE: "Purchase",
  WAREHOUSE: "Warehouse",
  VIEWER: "Read-only",
};
