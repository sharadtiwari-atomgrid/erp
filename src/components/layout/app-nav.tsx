"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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
  const menus: TopMenu[] = [
    {
      label: "Sales",
      groups: [
        { label: "Orders", items: pick([
          { label: "Sales Order Archives", href: "/b2b/archives" },
          { label: "Domestic Sales Orders", href: "/sales/orders" },
          { label: "Export Sales Orders", href: "/sales/orders" },
          { label: "Delivery Challan Order", href: "/logistics/documents" },
        ])},
        { label: "Transactions", items: pick([
          { label: "Sales Invoices", href: "/sales/invoices" },
          { label: "Customers", href: "/contacts?role=CUSTOMER" },
          { label: "Cash Receipt Journals", href: "/finance/receipts" },
        ])},
      ],
    },
    {
      label: "Purchase",
      groups: [
        { label: "Orders", items: pick([
          { label: "Purchase Orders", href: "/purchasing/orders" },
        ])},
        { label: "Transactions", items: pick([
          { label: "Purchase Invoices", href: "/finance/purchase-invoices" },
          { label: "Vendors", href: "/contacts?role=SUPPLIER" },
          { label: "Payment Journals", href: "/finance/vendor-payments" },
        ])},
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
        ])},
        { label: "Reconciliation", items: pick([
          { label: "Bank Accounts", href: "/finance/bank-accounts" },
          { label: "Bank Account Reconciliations", href: "/finance/bank-reconciliation" },
        ])},
        { label: "General Ledger", items: pick([
          { label: "Chart of Accounts", href: "/finance/accounts" },
          { label: "General Journals", href: "/finance/journals" },
          { label: "General Ledger Entries", href: "/finance/entries" },
          { label: "Dimensions", href: "/finance/dimensions" },
        ])},
      ],
    },
    {
      label: "Posted Documents",
      groups: [
        { label: "Purchase", items: pick([
          { label: "Posted Purchase Invoice", href: "/finance/purchase-invoices?status=POSTED" },
          { label: "Posted Purch Delivery Challan", href: "/logistics/documents" },
          { label: "Posted Purchase Credit Memos", href: "/finance/purchase-invoices?status=CANCELLED" },
        ])},
        { label: "Sales", items: pick([
          { label: "Posted Sales Invoices", href: "/sales/invoices?status=ISSUED" },
        ])},
        { label: "Transfer", items: pick([
          { label: "Posted Transfer Shipment", href: "/inventory/movements" },
          { label: "Posted Transfer Receipt", href: "/inventory/movements" },
        ])},
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
        ])},
        { label: "Finance Setup", items: pick([
          { label: "General Posting Setup", href: "/finance/posting-groups" },
          { label: "Currencies", href: "/finance/currencies" },
          { label: "Accounting Periods", href: "/finance/periods" },
        ])},
      ],
    },
  ];

  return menus.map((m) => ({ ...m, groups: m.groups.filter((g) => g.items.length > 0) })).filter((m) => m.groups.length > 0);
}

function Menu({ menu }: { menu: TopMenu }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const matches = (href: string) => pathname === href.split("?")[0] || pathname.startsWith(`${href.split("?")[0]}/`);
  const active = menu.groups.some((g) => g.items.some((i) => matches(i.href)));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={cn(
          "flex items-center gap-1 px-3 py-4 text-[15px] transition-colors",
          active ? "font-semibold text-ink" : "text-ink-soft hover:text-ink",
        )}
        aria-expanded={open}
      >
        {menu.label}<span className="text-xs">⌄</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 min-w-64 border border-line bg-surface py-2 shadow-lg">
          {menu.groups.map((group) => (
            <div key={group.label} className="px-2 py-1.5">
              <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">{group.label}</div>
              {group.items.map((item) => (
                <Link
                  key={`${item.href}-${item.label}`}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block whitespace-nowrap px-3 py-2 text-sm text-ink hover:bg-muted hover:text-ink"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Brand({ name }: { name: string }) {
  return (
    <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
      <span className="hidden sm:block truncate text-[22px] font-light tracking-tight text-ink">
        {name || "Atomgrid"}
      </span>
      <span className="sm:hidden"><AtomgridLogo /></span>
    </Link>
  );
}

export function AppNav({ groups, companyName }: { groups: Group[]; companyName: string }) {
  const menus = buildMenus(groups);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface print:hidden">
      <div className="flex h-14 items-center gap-2 px-5">
        <Brand name={companyName} />
        <div className="mx-2 hidden h-7 w-px bg-line lg:block" />
        <nav className="hidden items-center lg:flex">
          {menus.map((menu) => <Menu key={menu.label} menu={menu} />)}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="rounded-md px-2 py-1 text-lg text-ink-soft hover:bg-muted lg:hidden"
            aria-label="Open navigation"
          >
            ☰
          </button>
        </div>
      </div>
      {mobileOpen && (
        <div className="border-t border-line bg-surface px-4 py-3 lg:hidden">
          <div className="grid gap-1">
            {menus.map((menu) => (
              <details key={menu.label} className="border-b border-line py-2">
                <summary className="cursor-pointer list-none py-1 font-medium">{menu.label}</summary>
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
        </div>
      )}
    </header>
  );
}
