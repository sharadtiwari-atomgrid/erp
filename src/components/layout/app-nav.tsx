"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import { AtomgridLogo } from "@/components/layout/logo";
import { cn } from "@/lib/cn";

type Link_ = { label: string; href: string };
type Group = { key: string; label: string; color: string; items: Link_[]; subgroups: Array<{ label: string; items: Link_[] }> };
type MenuGroup = { label: string; items: Link_[] };
type TopMenu = { label: string; groups: MenuGroup[] };

function buildMenus(groups: Group[]): TopMenu[] {
  const all = groups.flatMap((g) => [...g.items, ...g.subgroups.flatMap((s) => s.items)]);
  const allowed = (href: string) => all.some((x) => x.href === href);
  const pick = (items: Link_[]) => items.filter((x) => allowed(x.href));

  return [
    {
      label: "Sales",
      groups: [
        { label: "Orders", items: pick([
          { label: "Sales Order Archives", href: "/b2b/archives" },
          { label: "Domestic Sales Orders", href: "/sales/orders" },
          { label: "Export Sales Orders", href: "/sales/orders" },
          { label: "Delivery Challan Order", href: "/logistics/documents" },
        ]) },
        { label: "Transactions", items: pick([
          { label: "Sales Invoices", href: "/sales/invoices" },
          { label: "Customers", href: "/contacts?role=CUSTOMER" },
          { label: "Cash Receipt Journals", href: "/finance/receipts" },
          { label: "Customer Ledger Entries", href: "/finance/customer-ledger" },
        ]) },
      ],
    },
    {
      label: "Purchase",
      groups: [
        { label: "Orders", items: pick([{ label: "Purchase Orders", href: "/purchasing/orders" }]) },
        { label: "Transactions", items: pick([
          { label: "Purchase Invoices", href: "/finance/purchase-invoices" },
          { label: "Vendors", href: "/contacts?role=SUPPLIER" },
          { label: "Payment Journals", href: "/finance/vendor-payments" },
          { label: "Vendor Ledger Entries", href: "/finance/vendor-ledger" },
        ]) },
      ],
    },
    {
      label: "Accounts",
      groups: [
        { label: "Voucher Transactions", items: pick([
          { label: "Bank Payment Voucher", href: "/finance/vendor-payments" },
          { label: "Bank Receipt Voucher", href: "/finance/receipts" },
          { label: "Cash Payment Voucher", href: "/finance/vendor-payments" },
          { label: "Cash Receipt Voucher", href: "/finance/receipts" },
          { label: "Contra Voucher", href: "/finance/journals" },
          { label: "Journal Voucher", href: "/finance/journals" },
        ]) },
        { label: "Reconciliation", items: pick([
          { label: "Bank Accounts", href: "/finance/bank-accounts" },
          { label: "Bank Account Reconciliations", href: "/finance/bank-reconciliation" },
        ]) },
        { label: "General Ledger", items: pick([
          { label: "Chart of Accounts", href: "/finance/accounts" },
          { label: "General Journals", href: "/finance/journals" },
          { label: "General Ledger Entries", href: "/finance/entries" },
          { label: "Customer Ledger Entries", href: "/finance/customer-ledger" },
          { label: "Vendor Ledger Entries", href: "/finance/vendor-ledger" },
          { label: "Dimensions", href: "/finance/dimensions" },
        ]) },
      ],
    },
    {
      label: "Posted Documents",
      groups: [
        { label: "Purchase", items: pick([
          { label: "Posted Purchase Invoice", href: "/finance/purchase-invoices?status=POSTED" },
          { label: "Posted Purch Delivery Challan", href: "/logistics/documents" },
          { label: "Posted Purchase Credit Memos", href: "/finance/purchase-invoices?status=CANCELLED" },
        ]) },
        { label: "Sales", items: pick([{ label: "Posted Sales Invoices", href: "/sales/invoices?status=ISSUED" }]) },
        { label: "Transfer", items: pick([
          { label: "Posted Transfer Shipment", href: "/inventory/movements" },
          { label: "Posted Transfer Receipt", href: "/inventory/movements" },
        ]) },
      ],
    },
    {
      label: "Master",
      groups: [
        { label: "Master Data", items: pick([
          { label: "Customers", href: "/contacts?role=CUSTOMER" },
          { label: "Vendors", href: "/contacts?role=SUPPLIER" },
          { label: "Items", href: "/inventory/products" },
          { label: "Warehouses & bins", href: "/inventory/warehouses" },
          { label: "Chart of Accounts", href: "/finance/accounts" },
        ]) },
        { label: "Finance Setup", items: pick([
          { label: "General Posting Setup", href: "/finance/posting-groups" },
          { label: "Currencies", href: "/finance/currencies" },
          { label: "Accounting Periods", href: "/finance/periods" },
        ]) },
      ],
    },
  ].map((m) => ({ ...m, groups: m.groups.filter((g) => g.items.length > 0) })).filter((m) => m.groups.length > 0);
}

function SubMenu({ group }: { group: MenuGroup }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex items-center gap-1 px-3 py-2.5 text-[15px] text-brand-700 hover:text-brand-800"
        aria-expanded={open}
      >
        {group.label}<span className="text-xs">⌄</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 min-w-64 border border-line bg-surface py-2 shadow-lg">
          {group.items.map((item) => (
            <Link
              key={`${item.href}-${item.label}`}
              href={item.href}
              className="block whitespace-nowrap px-4 py-2 text-sm text-ink hover:bg-muted"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Brand({ name }: { name: string }) {
  return (
    <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
      <span className="hidden truncate text-[22px] font-light tracking-tight text-ink lg:block">{name || "Atomgrid"}</span>
      <span className="lg:hidden"><AtomgridLogo /></span>
    </Link>
  );
}

export function AppNav({
  groups,
  companyName,
  rightSlot,
}: {
  groups: Group[];
  companyName: string;
  rightSlot?: ReactNode;
}) {
  const menus = useMemo(() => buildMenus(groups), [groups]);
  const pathname = usePathname();
  const activeMenu = menus.find((m) =>
    m.groups.some((g) => g.items.some((i) => pathname === i.href.split("?")[0] || pathname.startsWith(`${i.href.split("?")[0]}/`))),
  )?.label ?? "Sales";
  const [selected, setSelected] = useState(activeMenu);
  const current = menus.find((m) => m.label === selected) ?? menus[0];

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface print:hidden">
      <div className="flex h-14 items-center gap-3 border-b border-line px-5">
        <Brand name={companyName} />
        <div className="mx-1 hidden h-7 w-px bg-line lg:block" />
        <nav className="hidden items-center lg:flex">
          {menus.map((menu) => (
            <button
              key={menu.label}
              type="button"
              onClick={() => setSelected(menu.label)}
              className={cn(
                "flex items-center gap-1 px-3 py-4 text-[15px] transition-colors",
                selected === menu.label ? "font-semibold text-ink" : "text-ink-soft hover:text-ink",
              )}
            >
              {menu.label}<span className="text-xs">⌄</span>
            </button>
          ))}
        </nav>
        <div className="ml-auto hidden lg:flex">{rightSlot}</div>
        <button
          type="button"
          className="ml-auto rounded-md px-2 py-1 text-lg text-ink-soft hover:bg-muted lg:hidden"
          aria-label="Open navigation"
        >
          ☰
        </button>
      </div>

      {current && (
        <div className="hidden min-h-12 items-center gap-1 bg-muted/40 px-5 lg:flex">
          {current.groups.map((group) => <SubMenu key={group.label} group={group} />)}
          <div className="ml-auto text-xs text-ink-faint">Atomgrid ERP</div>
        </div>
      )}

      <div className="lg:hidden border-t border-line px-4 py-3">
        {menus.map((menu) => (
          <details key={menu.label} className="border-b border-line py-2">
            <summary className="cursor-pointer list-none font-medium">{menu.label}</summary>
            <div className="pl-3 pt-2">
              {menu.groups.map((group) => (
                <div key={group.label} className="mb-3">
                  <div className="mb-1 text-xs font-semibold text-ink-faint">{group.label}</div>
                  {group.items.map((item) => (
                    <Link key={`${item.href}-${item.label}`} href={item.href} className="block py-1.5 text-sm text-ink-soft">
                      {item.label}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </header>
  );
}
