"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { StatementLine } from "@/lib/finance/reports";
import { amt, amtClass } from "./amount";

/**
 * Schedule III statement (P&L or balance sheet) with headings that expand to
 * their accounts. Account rows link to the account's ledger for `drillQuery`.
 */
export function StatementTable({
  lines,
  columns,
  drillQuery,
}: {
  lines: StatementLine[];
  columns: string[];
  /** Query string for the account drill-down (date range). */
  drillQuery: string;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const expandable = lines.filter((l) => l.kind === "line" && l.accounts.length > 0);
  const allOpen = expandable.length > 0 && expandable.every((l) => open.has(l.key));
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div>
      <div className="flex justify-end border-b border-line px-4 py-2 print:hidden">
        <Button variant="ghost" size="sm" onClick={() => setOpen(allOpen ? new Set() : new Set(expandable.map((l) => l.key)))}>
          {allOpen ? "Collapse all" : "Expand all"}
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-ink-soft">Particulars</th>
              {columns.map((c) => (
                <th key={c} className="whitespace-nowrap px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map((l) => {
              if (l.kind === "heading") {
                return (
                  <tr key={l.key} className="bg-muted/30">
                    <td colSpan={columns.length + 1} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink">
                      {l.label}
                    </td>
                  </tr>
                );
              }
              const isOpen = open.has(l.key);
              const canExpand = l.kind === "line" && l.accounts.length > 0;
              return (
                <Fragment key={l.key}>
                  <tr className={cn(l.kind === "total" ? "bg-muted/40 font-semibold" : "hover:bg-muted/30")}>
                    <td className={cn("px-4 py-2 text-ink", (l.level ?? 0) > 0 && "pl-8")}>
                      {canExpand ? (
                        <button type="button" onClick={() => toggle(l.key)} className="inline-flex items-center gap-1.5 text-left hover:text-brand-700" aria-expanded={isOpen}>
                          <span aria-hidden className="inline-block w-3 text-ink-faint">
                            {isOpen ? "▾" : "▸"}
                          </span>
                          {l.label}
                        </button>
                      ) : (
                        <span className={cn(l.kind === "line" && "pl-[18px]")}>{l.label}</span>
                      )}
                    </td>
                    {l.amounts.map((v, i) => (
                      <td key={i} className={cn("whitespace-nowrap px-4 py-2 text-right tabular-nums", amtClass(v))}>
                        {amt(v)}
                      </td>
                    ))}
                  </tr>
                  {isOpen &&
                    l.accounts.map((a) => (
                      <tr key={`${l.key}:${a.id}`} className="text-ink-soft">
                        <td className="py-1.5 pl-16 pr-4 text-xs">
                          {a.code ? (
                            <Link href={`/finance/accounts/${a.id}?${drillQuery}`} className="hover:text-brand-700 hover:underline">
                              <span className="tabular-nums">{a.code}</span> · {a.name}
                            </Link>
                          ) : (
                            <span className="italic">{a.name}</span>
                          )}
                        </td>
                        {a.amounts.map((v, i) => (
                          <td key={i} className={cn("whitespace-nowrap px-4 py-1.5 text-right text-xs tabular-nums", amtClass(v))}>
                            {amt(v)}
                          </td>
                        ))}
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
