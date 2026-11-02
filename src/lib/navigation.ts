import type { Module } from "@/lib/permissions";

export type NavItem = { label: string; href: string; module: Module };
export type NavGroup = { label: string; items: NavItem[] };

export const NAVIGATION: NavGroup[] = [
  { label: "Overview", items: [{ label: "Dashboard", href: "/dashboard", module: "dashboard" }] },
  {
    label: "CRM",
    items: [
      { label: "Customers", href: "/crm/customers", module: "customers" },
      { label: "Leads", href: "/crm/leads", module: "leads" },
    ],
  },
  {
    label: "Sales",
    items: [
      { label: "Quotations", href: "/sales/quotations", module: "quotations" },
      { label: "Sales orders", href: "/sales/orders", module: "salesOrders" },
      { label: "Invoices", href: "/sales/invoices", module: "invoices" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { label: "Products", href: "/inventory/products", module: "products" },
      { label: "Categories", href: "/inventory/categories", module: "products" },
      { label: "Stock on hand", href: "/inventory/stock", module: "stock" },
      { label: "Stock movements", href: "/inventory/movements", module: "stock" },
      { label: "Warehouses", href: "/inventory/warehouses", module: "warehouses" },
    ],
  },
  {
    label: "Purchasing",
    items: [
      { label: "Suppliers", href: "/purchasing/suppliers", module: "suppliers" },
      { label: "Purchase orders", href: "/purchasing/orders", module: "purchaseOrders" },
    ],
  },
  {
    label: "Settings",
    items: [
      { label: "Company", href: "/settings/company", module: "settings" },
      { label: "Users", href: "/settings/users", module: "settings" },
    ],
  },
];
