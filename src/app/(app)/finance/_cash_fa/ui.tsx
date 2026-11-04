import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";

/** Money with negatives in red brackets; blank (or a dash) for zero when `blankZero`. */
export function Amount({ value, blankZero, className }: { value: number; blankZero?: boolean; className?: string }) {
  if (blankZero && Math.abs(value) < 0.005) return <span className={cn("text-ink-faint", className)}>—</span>;
  if (value < 0) return <span className={cn("text-red-600", className)}>({formatMoney(-value)})</span>;
  return <span className={className}>{formatMoney(value)}</span>;
}

/** Small pill-style tab links (e.g. Weekly / Monthly). */
export function TabLinks({ tabs }: { tabs: Array<{ href: string; label: ReactNode; active: boolean }> }) {
  return (
    <div className="inline-flex rounded-md border border-line bg-surface p-0.5 text-sm">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn("rounded px-3 py-1", t.active ? "bg-brand-600 font-medium text-white" : "text-ink-soft hover:text-ink")}
          aria-current={t.active ? "page" : undefined}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

/** Note box for explanations on finance pages. */
export function Note({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warning" }) {
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        tone === "warning" ? "border-amber-300 bg-amber-50 text-amber-800" : "border-line bg-muted/50 text-ink-soft",
      )}
    >
      {children}
    </div>
  );
}
