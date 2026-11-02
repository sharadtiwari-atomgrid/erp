import type { Module } from "@/lib/permissions";

export type NavItem = { label: string; href: string; module: Module };
export type NavGroup = { key: string; label: string; color: string; items: NavItem[] };

/** Sidebar sections, following the ERPKaro application map. `color` tints the section marker. */
export const NAVIGATION: NavGroup[] = [
  { key: "overview", label: "Overview", color: "#94a3b8", items: [{ label: "Dashboard", href: "/dashboard", module: "dashboard" }] },
  {
    key: "quick",
    label: "Quick actions",
    color: "#f6c98e",
    items: [
      { label: "Branches", href: "/branches", module: "branches" },
      { label: "Teams", href: "/teams", module: "teams" },
      { label: "Third-party contacts", href: "/contacts", module: "contacts" },
    ],
  },
  {
    key: "inventory",
    label: "Inventory",
    color: "#86d29b",
    items: [
      { label: "Items", href: "/inventory/products", module: "products" },
      { label: "Categories", href: "/inventory/categories", module: "products" },
    ],
  },
  {
    key: "warehouse",
    label: "Warehouse management",
    color: "#c4b5fd",
    items: [
      { label: "Stock management", href: "/inventory/stock", module: "stock" },
      { label: "Stock ledger", href: "/inventory/movements", module: "stock" },
      { label: "Inbound", href: "/warehouse/inbound", module: "inbound" },
      { label: "Outbound", href: "/warehouse/outbound", module: "outbound" },
      { label: "Picking sessions", href: "/warehouse/picking", module: "outbound" },
      { label: "Warehouses & bins", href: "/inventory/warehouses", module: "warehouses" },
    ],
  },
  {
    key: "orders",
    label: "Order management",
    color: "#7dd3c8",
    items: [
      { label: "Leads", href: "/crm/leads", module: "leads" },
      { label: "Quotations", href: "/sales/quotations", module: "quotations" },
      { label: "Sales orders", href: "/sales/orders", module: "salesOrders" },
      { label: "Purchase orders", href: "/purchasing/orders", module: "purchaseOrders" },
      { label: "Manufacturing needs", href: "/manufacturing/needs", module: "mfgNeeds" },
      { label: "Returns", href: "/returns", module: "returns" },
    ],
  },
  {
    key: "manufacturing",
    label: "Manufacturing ops",
    color: "#6b9cf5",
    items: [
      { label: "Production orders", href: "/manufacturing/orders", module: "production" },
      { label: "Schedule", href: "/manufacturing/schedule", module: "production" },
      { label: "Production batches", href: "/manufacturing/batches", module: "production" },
      { label: "Hub settings", href: "/manufacturing/hub", module: "hubSettings" },
    ],
  },
  {
    key: "logistics",
    label: "Logistics",
    color: "#f09ad8",
    items: [
      { label: "Trips", href: "/logistics/trips", module: "trips" },
      { label: "ASN & delivery notes", href: "/logistics/documents", module: "trips" },
      { label: "Vehicles", href: "/logistics/vehicles", module: "fleet" },
      { label: "Drivers", href: "/logistics/drivers", module: "fleet" },
      { label: "Fuel logs", href: "/logistics/fuel", module: "fleet" },
    ],
  },
  {
    key: "books",
    label: "Books / accounts",
    color: "#f08a7e",
    items: [
      { label: "Invoices", href: "/sales/invoices", module: "invoices" },
      { label: "E-way bills", href: "/books/eway-bills", module: "eWayBills" },
      { label: "Tally export", href: "/books/export", module: "eWayBills" },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    color: "#94a3b8",
    items: [
      { label: "Company", href: "/settings/company", module: "settings" },
      { label: "Users", href: "/settings/users", module: "settings" },
      { label: "Roles & access", href: "/settings/roles", module: "settings" },
    ],
  },
];
