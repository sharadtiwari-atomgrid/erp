/**
 * Module-level access control. Each AccessRole stores a map of module → level
 * ("none" | "view" | "edit"); roles with fullAccess can do everything.
 * Add new modules here and they appear automatically in the role editor.
 */
export const MODULES = {
  dashboard: { label: "Dashboard", section: "overview" },
  branches: { label: "Branches", section: "quick" },
  teams: { label: "Teams", section: "quick" },
  contacts: { label: "Third-party contacts", section: "quick" },
  products: { label: "Items & categories", section: "inventory" },
  stock: { label: "Stock management", section: "warehouse" },
  warehouses: { label: "Warehouses & bins", section: "warehouse" },
  inbound: { label: "Inbound (GRN & QC)", section: "warehouse" },
  outbound: { label: "Outbound (pick, pack, dispatch)", section: "warehouse" },
  leads: { label: "Leads", section: "orders" },
  quotations: { label: "Quotations", section: "orders" },
  salesOrders: { label: "Sales orders", section: "orders" },
  purchaseOrders: { label: "Purchase orders", section: "orders" },
  mfgNeeds: { label: "Manufacturing needs", section: "orders" },
  returns: { label: "Returns", section: "orders" },
  hubSettings: { label: "Hub settings (units, machines, BOMs)", section: "manufacturing" },
  production: { label: "Production orders, schedule & batches", section: "manufacturing" },
  fleet: { label: "Fleet (vehicles, drivers, fuel)", section: "logistics" },
  trips: { label: "Trips & shipping documents", section: "logistics" },
  invoices: { label: "Invoices & payments", section: "books" },
  eWayBills: { label: "E-way bills & exports", section: "books" },
  settings: { label: "Company, users & roles", section: "settings" },
} as const;

export type Module = keyof typeof MODULES;
export type Access = "view" | "edit";
export type Level = "none" | Access;
export type Permissions = Partial<Record<Module, Level>>;

/** Anything carrying a role's access rules, typically the CurrentUser. */
export type Principal = { fullAccess: boolean; permissions: Permissions };

export function can(user: Principal, module: Module, access: Access = "view"): boolean {
  if (user.fullAccess) return true;
  if (module === "dashboard" && access === "view") return true;
  const level = user.permissions[module] ?? "none";
  return access === "view" ? level !== "none" : level === "edit";
}

/** Coerces the JSON stored on AccessRole into a clean Permissions map. */
export function parsePermissions(value: unknown): Permissions {
  const out: Permissions = {};
  if (value && typeof value === "object") {
    for (const [key, level] of Object.entries(value)) {
      if (key in MODULES && (level === "none" || level === "view" || level === "edit")) out[key as Module] = level;
    }
  }
  return out;
}

const all = (level: Level): Permissions =>
  Object.fromEntries(Object.keys(MODULES).map((m) => [m, level])) as Permissions;

/** Roles created by the seed. Admins can edit or add roles in Settings → Roles. */
export const DEFAULT_ROLES: Array<{ name: string; description: string; fullAccess?: boolean; permissions: Permissions }> = [
  { name: "Administrator", description: "Full access to everything, including settings.", fullAccess: true, permissions: {} },
  { name: "Manager", description: "Runs operations across all modules except settings.", permissions: { ...all("edit"), settings: "none" } },
  {
    name: "Sales",
    description: "Leads, quotations, sales orders, invoices and returns.",
    permissions: { contacts: "edit", leads: "edit", quotations: "edit", salesOrders: "edit", invoices: "edit", returns: "edit", products: "view", stock: "view", mfgNeeds: "view", outbound: "view", trips: "view" },
  },
  {
    name: "Procurement",
    description: "Suppliers and purchase orders.",
    permissions: { contacts: "edit", purchaseOrders: "edit", products: "edit", stock: "view", inbound: "view", mfgNeeds: "view", salesOrders: "view" },
  },
  {
    name: "Warehouse",
    description: "Stock, bins, inbound QC and outbound picking/packing.",
    permissions: { stock: "edit", warehouses: "edit", inbound: "edit", outbound: "edit", returns: "edit", products: "view", salesOrders: "view", purchaseOrders: "view", contacts: "view", trips: "view" },
  },
  {
    name: "Production",
    description: "Hub settings, production orders, scheduling and batch QC.",
    permissions: { hubSettings: "edit", production: "edit", mfgNeeds: "edit", products: "view", stock: "view", salesOrders: "view" },
  },
  {
    name: "Logistics",
    description: "Fleet, drivers, trips, ASN/DN and e-way bills.",
    permissions: { fleet: "edit", trips: "edit", eWayBills: "edit", outbound: "view", contacts: "view", invoices: "view" },
  },
  {
    name: "Accounts",
    description: "Invoices, payments, e-way bills and exports.",
    permissions: { invoices: "edit", eWayBills: "edit", contacts: "view", salesOrders: "view", purchaseOrders: "view", returns: "view" },
  },
  { name: "Read-only", description: "Can view everything except settings.", permissions: { ...all("view"), settings: "none" } },
];
