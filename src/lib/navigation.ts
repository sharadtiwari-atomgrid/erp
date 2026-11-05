import type { Module } from "@/lib/permissions";

export type NavItem = { label: string; href: string; module: Module };
/** A department inside a division (e.g. B2B › Demand). */
export type NavSubgroup = { label: string; items: NavItem[] };
/**
 * A top-level section of the company tree. Divisions (B2B, B2C) hold
 * departments in `subgroups`; the other sections list pages in `items`.
 * `color` tints the section marker.
 */
export type NavGroup = { key: string; label: string; color: string; items?: NavItem[]; subgroups?: NavSubgroup[] };

/** Company › Division (B2B, B2C) › departments, then Shared Masters, Inventory, Finance, Administration. */
export const NAVIGATION: NavGroup[] = [
  { key: "overview", label: "Company", color: "#94a3b8", items: [{ label: "Dashboard", href: "/dashboard", module: "dashboard" }] },
  {
    key: "b2b",
    label: "B2B division",
    color: "#8dc63f",
    subgroups: [
      {
        label: "Overview",
        items: [
          { label: "Today", href: "/b2b", module: "b2bOrders" },
          { label: "B2B dashboard", href: "/b2b/dashboard", module: "b2bReports" },
          { label: "Shipments summary", href: "/b2b/views/summary", module: "b2bReports" },
        ],
      },
      {
        label: "Demand",
        items: [
          { label: "Leads", href: "/crm/leads", module: "leads" },
          { label: "Quotations", href: "/sales/quotations", module: "quotations" },
          { label: "Fresh PO", href: "/b2b/fresh-po", module: "b2bOrders" },
          { label: "Long Hold PO", href: "/b2b/long-hold", module: "b2bOrders" },
          { label: "Sales orders", href: "/sales/orders", module: "salesOrders" },
          { label: "Returns", href: "/returns", module: "returns" },
        ],
      },
      {
        label: "Supply",
        items: [
          { label: "Purchase orders", href: "/purchasing/orders", module: "purchaseOrders" },
          { label: "Manufacturing needs", href: "/manufacturing/needs", module: "mfgNeeds" },
          { label: "Production orders", href: "/manufacturing/orders", module: "production" },
          { label: "Production schedule", href: "/manufacturing/schedule", module: "production" },
          { label: "Production batches", href: "/manufacturing/batches", module: "production" },
          { label: "Hub settings", href: "/manufacturing/hub", module: "hubSettings" },
        ],
      },
      {
        label: "Logistics",
        items: [
          { label: "Domestic MIS", href: "/b2b/mis", module: "b2bOrders" },
          { label: "Quotation sheet (D-0)", href: "/b2b/quotation-sheet", module: "b2bOrders" },
          { label: "Planned", href: "/b2b/views/planned", module: "b2bReports" },
          { label: "In transit", href: "/b2b/views/intransit", module: "b2bReports" },
          { label: "Delivered", href: "/b2b/views/delivered", module: "b2bReports" },
          { label: "Daily digest", href: "/b2b/views/daily-digest", module: "b2bReports" },
          { label: "Transport payables", href: "/b2b/transport/payables", module: "transportOps" },
          { label: "Transport performance", href: "/b2b/transport/performance", module: "transportOps" },
          { label: "Transport finder", href: "/b2b/transport/finder", module: "transportOps" },
          { label: "Trips", href: "/logistics/trips", module: "trips" },
          { label: "ASN & delivery notes", href: "/logistics/documents", module: "trips" },
          { label: "Vehicles", href: "/logistics/vehicles", module: "fleet" },
          { label: "Drivers", href: "/logistics/drivers", module: "fleet" },
          { label: "Fuel logs", href: "/logistics/fuel", module: "fleet" },
        ],
      },
      {
        label: "R&D",
        items: [
          { label: "Projects", href: "/b2b/rnd", module: "rnd" },
          { label: "Experiments", href: "/b2b/rnd/experiments", module: "rnd" },
        ],
      },
      { label: "Pilots", items: [{ label: "Pilot runs", href: "/b2b/pilots", module: "pilots" }] },
      { label: "QC Sampling", items: [{ label: "Samples & tests", href: "/b2b/qc", module: "qcSampling" }] },
      { label: "Licensing", items: [{ label: "Licences", href: "/b2b/licenses", module: "licensing" }] },
      {
        label: "Certificates",
        items: [
          { label: "Certificate library", href: "/b2b/certificates", module: "certificates" },
          { label: "COA generator", href: "/b2b/tools/coa", module: "opsTools" },
        ],
      },
    ],
  },
  {
    key: "b2c",
    label: "B2C division",
    color: "#f09ad8",
    subgroups: [
      {
        label: "Order Management",
        items: [
          { label: "B2C overview", href: "/b2c", module: "b2cOrders" },
          { label: "Orders", href: "/b2c/orders", module: "b2cOrders" },
        ],
      },
      { label: "Payments", items: [{ label: "Payments & refunds", href: "/b2c/payments", module: "b2cPayments" }] },
      { label: "Demand & Allocation", items: [{ label: "Allocation", href: "/b2c/allocation", module: "b2cAllocation" }] },
      { label: "Supply", items: [{ label: "Replenishment", href: "/b2c/supply", module: "b2cSupply" }] },
      { label: "Warehouse", items: [{ label: "Pick & pack", href: "/b2c/warehouse", module: "b2cWarehouse" }] },
      { label: "Logistics", items: [{ label: "Shipments", href: "/b2c/shipments", module: "b2cLogistics" }] },
      { label: "Returns", items: [{ label: "Returns & RTO", href: "/b2c/returns", module: "b2cReturns" }] },
      { label: "Customer Management", items: [{ label: "Customers", href: "/b2c/customers", module: "b2cCustomers" }] },
    ],
  },
  {
    key: "masters",
    label: "Shared masters",
    color: "#f6c98e",
    items: [
      { label: "Contacts", href: "/contacts", module: "contacts" },
      { label: "POCs", href: "/contacts/pocs", module: "contacts" },
      { label: "Items", href: "/inventory/products", module: "products" },
      { label: "Categories", href: "/inventory/categories", module: "products" },
      { label: "Product name check", href: "/inventory/products/name-check", module: "products" },
      { label: "Warehouses & bins", href: "/inventory/warehouses", module: "warehouses" },
    ],
  },
  {
    key: "inventory",
    label: "Inventory",
    color: "#86d29b",
    items: [
      { label: "Stock management", href: "/inventory/stock", module: "stock" },
      { label: "Stock ledger", href: "/inventory/movements", module: "stock" },
      { label: "Inbound (GRN & QC)", href: "/warehouse/inbound", module: "inbound" },
      { label: "Outbound", href: "/warehouse/outbound", module: "outbound" },
      { label: "Picking sessions", href: "/warehouse/picking", module: "outbound" },
      { label: "Batch stock in hand", href: "/b2b/inventory/stock", module: "batchInventory" },
      { label: "Batch inward", href: "/b2b/inventory/inward", module: "batchInventory" },
      { label: "Batch outward", href: "/b2b/inventory/outward", module: "batchInventory" },
      { label: "Lost & found", href: "/b2b/inventory/lost-and-found", module: "batchInventory" },
      { label: "Damage & relabelling", href: "/b2b/inventory/damage", module: "batchInventory" },
    ],
  },
  {
    // Organised like a standard ERP finance module (General Ledger, Receivables,
    // Payables, Cash Management, Fixed Assets, Tax, Reports, Setup).
    key: "finance",
    label: "Finance",
    color: "#f08a7e",
    subgroups: [
      { label: "Home", items: [{ label: "Finance Role Center", href: "/finance", module: "finance" }] },
      {
        label: "General Ledger",
        items: [
          { label: "Chart of Accounts", href: "/finance/accounts", module: "finance" },
          { label: "General Journals", href: "/finance/journals", module: "finance" },
          { label: "General Ledger Entries", href: "/finance/entries", module: "finance" },
          { label: "Accounting Periods", href: "/finance/periods", module: "finance" },
          { label: "G/L Budgets", href: "/finance/budgets", module: "finance" },
          { label: "Dimensions", href: "/finance/dimensions", module: "finance" },
        ],
      },
      {
        label: "Sales & Receivables",
        items: [
          { label: "Sales Invoices", href: "/sales/invoices", module: "invoices" },
          { label: "Cash Receipt Journals", href: "/finance/receipts", module: "finance" },
          { label: "Aged Accounts Receivable", href: "/finance/aged-receivables", module: "finance" },
        ],
      },
      {
        label: "Purchases & Payables",
        items: [
          { label: "Purchase Invoices", href: "/finance/purchase-invoices", module: "finance" },
          { label: "Payment Journals", href: "/finance/vendor-payments", module: "finance" },
          { label: "Aged Accounts Payable", href: "/finance/aged-payables", module: "finance" },
        ],
      },
      {
        label: "Cash Management",
        items: [
          { label: "Bank Accounts", href: "/finance/bank-accounts", module: "finance" },
          { label: "Bank Account Reconciliations", href: "/finance/bank-reconciliation", module: "finance" },
          { label: "Cash Flow Forecasts", href: "/finance/cash-flow-forecast", module: "finance" },
        ],
      },
      {
        label: "Fixed Assets",
        items: [
          { label: "Fixed Assets", href: "/finance/fixed-assets", module: "finance" },
          { label: "Calculate Depreciation", href: "/finance/depreciation", module: "finance" },
        ],
      },
      {
        label: "GST & TDS",
        items: [
          { label: "GST Returns", href: "/finance/gst-returns", module: "finance" },
          { label: "TDS & TCS Entries", href: "/finance/tds", module: "finance" },
          { label: "E-Way Bills", href: "/books/eway-bills", module: "eWayBills" },
        ],
      },
      {
        label: "Financial Reports",
        items: [
          { label: "Trial Balance", href: "/finance/reports/trial-balance", module: "finance" },
          { label: "Income Statement", href: "/finance/reports/profit-and-loss", module: "finance" },
          { label: "Balance Sheet", href: "/finance/reports/balance-sheet", module: "finance" },
          { label: "Statement of Cash Flows", href: "/finance/reports/cash-flow", module: "finance" },
        ],
      },
      {
        label: "Setup",
        items: [
          { label: "General Posting Setup", href: "/finance/posting-groups", module: "finance" },
          { label: "Currencies", href: "/finance/currencies", module: "finance" },
          { label: "Tally Export", href: "/books/export", module: "eWayBills" },
        ],
      },
    ],
  },
  {
    key: "admin",
    label: "Administration",
    color: "#94a3b8",
    items: [
      { label: "Company", href: "/settings/company", module: "settings" },
      { label: "Branches", href: "/branches", module: "branches" },
      { label: "Teams", href: "/teams", module: "teams" },
      { label: "Users", href: "/settings/users", module: "settings" },
      { label: "Roles & access", href: "/settings/roles", module: "settings" },
      { label: "Archives", href: "/b2b/archives", module: "b2bOrders" },
      { label: "Bugs & requests", href: "/settings/feedback", module: "settings" },
    ],
  },
];

/** Every page link in the tree, in order. */
export function navItems(groups: NavGroup[] = NAVIGATION): NavItem[] {
  return groups.flatMap((g) => [...(g.items ?? []), ...(g.subgroups ?? []).flatMap((s) => s.items)]);
}
