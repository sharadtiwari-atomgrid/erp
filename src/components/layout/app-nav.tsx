"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";

type Group = { label: string; color: string; items: Array<{ label: string; href: string }> };

function NavLinks({ groups, onNavigate }: { groups: Group[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-5">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="flex items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            <span className="h-2 w-2 rounded-full" style={{ background: group.color }} aria-hidden />
            {group.label}
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "block rounded-md px-3 py-1.5 text-sm transition-colors",
                      active ? "bg-white/10 font-medium text-white" : "text-sidebar-ink hover:bg-white/5 hover:text-white",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand({ name }: { name: string }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5 px-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-brand-600 text-sm font-bold text-white">A</span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-semibold text-white">{name}</span>
        <span className="block text-[11px] text-slate-400">Atomgrid ERP</span>
      </span>
    </Link>
  );
}

export function AppNav({ groups, companyName }: { groups: Group[]; companyName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto bg-sidebar px-3 py-5 lg:flex print:hidden">
        <Brand name={companyName} />
        <div className="mt-8">
          <NavLinks groups={groups} />
        </div>
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="flex items-center justify-between bg-sidebar px-4 py-3 lg:hidden print:hidden">
        <Brand name={companyName} />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md px-2 py-1 text-sm text-sidebar-ink hover:bg-white/10"
          aria-label="Open menu"
        >
          ☰ Menu
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-label="Close menu" />
          <aside className="absolute inset-y-0 left-0 w-64 overflow-y-auto bg-sidebar px-3 py-5">
            <Brand name={companyName} />
            <div className="mt-8">
              <NavLinks groups={groups} onNavigate={() => setOpen(false)} />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
