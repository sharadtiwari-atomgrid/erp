import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";

/** Money amount: negatives in brackets and red; zero shown as a dash when `blankZero`. */
export function Amount({ value, blankZero, className }: { value: number; blankZero?: boolean; className?: string }) {
  if (blankZero && Math.abs(value) < 0.005) return <span className={cn("text-ink-faint", className)}>—</span>;
  if (value < -0.004) return <span className={cn("text-red-600", className)}>({formatMoney(-value)})</span>;
  return <span className={className}>{formatMoney(value)}</span>;
}

/** Small label + control used in GET filter bars. */
export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
      {label}
      {children}
    </label>
  );
}

/** "DIVISION: B2B · PROJECT: P1" from a dimensions JSON value. */
export function dimensionText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  return Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(" · ");
}
