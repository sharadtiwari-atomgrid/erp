/**
 * Module-level access control. Each AccessRole stores a map of module → level
 * ("none" | "view" | "edit"); roles with fullAccess can do everything.
 * Add new modules here and they appear automatically in the role editor.
 */
export const MODULES = {
  dashboard: { label: "Dashboard", section: "overview" },
  branches: { label: "Branches", section: "admin" },
  teams: { label: "Teams", section: "admin" },
  contacts: { label: "Third-party contacts", section: "masters" },
  products: { label: "Items & categories", section: "masters" },
  stock: { label: "Stock management", section: "inventory" },
  warehouses: { label: "Warehouses & bins", section: "masters" },
  inbound: { label: "Inbound (GRN & QC)", section: "inventory" },
  outbound: { label: "Outbound (pick, pack, dispatch)", section: "inventory" },
  leads: { label: "Leads", section: "b2b" },
  quotations: { label: "Quotations", section: "b2b" },
  salesOrders: { label: "Sales orders", section: "b2b" },
  purchaseOrders: { label: "Purchase orders", section: "b2b" },
  mfgNeeds: { label: "Manufacturing needs", section: "b2b" },
  returns: { label: "Returns", section: "b2b" },
  hubSettings: { label: "Hub settings (units, machines, BOMs)", section: "b2b" },
  production: { label: "Production orders, schedule & batches", section: "b2b" },
  fleet: { label: "Fleet (vehicles, drivers, fuel)", section: "b2b" },
  trips: { label: "Trips & shipping documents", section: "b2b" },
  finance: { label: "Finance: ledger, cash, assets, tax & reports", section: "finance" },
  invoices: { label: "Invoices & payments", section: "finance" },
  eWayBills: { label: "E-way bills & exports", section: "finance" },
  b2bOrders: { label: "Domestic B2B: Fresh PO, Long Hold, Domestic MIS, D-0 quotes", section: "b2b" },
  b2bReports: { label: "Domestic B2B: dashboard, views & daily digest", section: "b2b" },
  opsTools: { label: "COA generator", section: "b2b" },
  batchInventory: { label: "Batch inventory registers", section: "inventory" },
  transportOps: { label: "Transport performance, payables & finder", section: "b2b" },
  rnd: { label: "R&D projects & experiments", section: "b2b" },
  pilots: { label: "Pilot runs", section: "b2b" },
  qcSampling: { label: "QC sampling & tests", section: "b2b" },
  licensing: { label: "Licences & registrations", section: "b2b" },
  certificates: { label: "Certificate library", section: "b2b" },
  b2cOrders: { label: "B2C orders", section: "b2c" },
  b2cPayments: { label: "B2C payments & refunds", section: "b2c" },
  b2cAllocation: { label: "B2C demand & allocation", section: "b2c" },
  b2cSupply: { label: "B2C replenishment", section: "b2c" },
  b2cWarehouse: { label: "B2C pick & pack", section: "b2c" },
  b2cLogistics: { label: "B2C shipments", section: "b2c" },
  b2cReturns: { label: "B2C returns & RTO", section: "b2c" },
  b2cCustomers: { label: "B2C customers", section: "b2c" },
  settings: { label: "Company, users & roles", section: "admin" },
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
    permissions: { contacts: "edit", leads: "edit", quotations: "edit", salesOrders: "edit", invoices: "edit", returns: "edit", products: "view", stock: "view", mfgNeeds: "view", outbound: "view", trips: "view", b2bOrders: "edit", b2bReports: "view", batchInventory: "view" },
  },
  {
    name: "Procurement",
    description: "Suppliers and purchase orders.",
    permissions: { contacts: "edit", purchaseOrders: "edit", products: "edit", stock: "view", inbound: "view", mfgNeeds: "view", salesOrders: "view", b2bOrders: "edit", b2bReports: "view", batchInventory: "view", opsTools: "edit" },
  },
  {
    name: "Warehouse",
    description: "Stock, bins, inbound QC and outbound picking/packing.",
    permissions: { stock: "edit", warehouses: "edit", inbound: "edit", outbound: "edit", returns: "edit", products: "view", salesOrders: "view", purchaseOrders: "view", contacts: "view", trips: "view", batchInventory: "edit", b2bOrders: "view", b2bReports: "view" },
  },
  {
    name: "Production",
    description: "Hub settings, production orders, scheduling and batch QC.",
    permissions: { hubSettings: "edit", production: "edit", mfgNeeds: "edit", products: "view", stock: "view", salesOrders: "view", opsTools: "edit", batchInventory: "view" },
  },
  {
    name: "Logistics",
    description: "Fleet, drivers, trips, ASN/DN and e-way bills.",
    permissions: { fleet: "edit", trips: "edit", eWayBills: "edit", outbound: "view", contacts: "view", invoices: "view", b2bOrders: "edit", b2bReports: "view", transportOps: "edit", batchInventory: "view" },
  },
  {
    name: "Accounts",
    description: "Invoices, payments, e-way bills and exports.",
    permissions: { finance: "edit", invoices: "edit", eWayBills: "edit", contacts: "view", salesOrders: "view", purchaseOrders: "view", returns: "view", transportOps: "view", b2bReports: "view", b2bOrders: "view" },
  },
  { name: "Read-only", description: "Can view everything except settings.", permissions: { ...all("view"), settings: "none" } },
];
