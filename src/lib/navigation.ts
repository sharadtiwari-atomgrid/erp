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
      { label: "POCs", href: "/contacts/pocs", module: "contacts" },
    ],
  },
  {
    key: "b2b",
    label: "Domestic B2B",
    color: "#f2cf5b",
    items: [
      { label: "Today", href: "/b2b", module: "b2bOrders" },
      { label: "Fresh PO", href: "/b2b/fresh-po", module: "b2bOrders" },
      { label: "Long Hold PO", href: "/b2b/long-hold", module: "b2bOrders" },
      { label: "Domestic MIS", href: "/b2b/mis", module: "b2bOrders" },
      { label: "Quotation sheet (D-0)", href: "/b2b/quotation-sheet", module: "b2bOrders" },
      { label: "COA generator", href: "/b2b/tools/coa", module: "opsTools" },
      { label: "Archives", href: "/b2b/archives", module: "b2bOrders" },
    ],
  },
  {
    key: "b2bViews",
    label: "B2B views",
    color: "#f2cf5b",
    items: [
      { label: "Dashboard", href: "/b2b/dashboard", module: "b2bReports" },
      { label: "Shipments summary", href: "/b2b/views/summary", module: "b2bReports" },
      { label: "In transit", href: "/b2b/views/intransit", module: "b2bReports" },
      { label: "Planned", href: "/b2b/views/planned", module: "b2bReports" },
      { label: "Delivered", href: "/b2b/views/delivered", module: "b2bReports" },
      { label: "Daily digest", href: "/b2b/views/daily-digest", module: "b2bReports" },
    ],
  },
  {
    key: "inventory",
    label: "Inventory",
    color: "#86d29b",
    items: [
      { label: "Items", href: "/inventory/products", module: "products" },
      { label: "Categories", href: "/inventory/categories", module: "products" },
      { label: "Product name check", href: "/inventory/products/name-check", module: "products" },
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
      { label: "Batch stock in hand", href: "/b2b/inventory/stock", module: "batchInventory" },
      { label: "Batch inward", href: "/b2b/inventory/inward", module: "batchInventory" },
      { label: "Batch outward", href: "/b2b/inventory/outward", module: "batchInventory" },
      { label: "Lost & found", href: "/b2b/inventory/lost-and-found", module: "batchInventory" },
      { label: "Damage & relabelling", href: "/b2b/inventory/damage", module: "batchInventory" },
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
      { label: "Transport performance", href: "/b2b/transport/performance", module: "transportOps" },
      { label: "Transport payables", href: "/b2b/transport/payables", module: "transportOps" },
      { label: "Transport finder", href: "/b2b/transport/finder", module: "transportOps" },
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
      { label: "Bugs & requests", href: "/settings/feedback", module: "settings" },
    ],
  },
];
