"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { toCsv } from "@/lib/ops/transport";

export const inr = (n: number | null | undefined) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
export const inr2 = (n: number | null | undefined) =>
  "₹" + (n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function downloadCsv(filename: string, header: string[], rows: Array<Array<string | number | null | undefined>>) {
  const url = URL.createObjectURL(new Blob([toCsv(header, rows)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type Tone = "good" | "warn" | "bad" | "none" | "";

export const toneText: Record<string, string> = {
  good: "text-emerald-700",
  warn: "text-amber-700",
  bad: "text-red-700",
  none: "text-ink-faint",
  "": "",
};

/** A stat tile; clickable when onClick is given. */
export function Tile({
  value, label, sub, tone = "", active, onClick, title,
}: {
  value: ReactNode;
  label: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const cls = cn(
    "flex flex-col gap-0.5 rounded-lg border bg-surface px-4 py-3 text-left shadow-sm",
    tone === "good" ? "border-emerald-200 bg-emerald-50/60" : tone === "warn" ? "border-amber-200 bg-amber-50/60" : tone === "bad" ? "border-red-200 bg-red-50/60" : "border-line",
    active && "ring-2 ring-brand-500",
  );
  const body = (
    <>
      <span className={cn("text-xl font-semibold tabular-nums", toneText[tone] || "text-ink")}>{value}</span>
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</span>
      {sub && <span className="text-xs text-ink-faint">{sub}</span>}
    </>
  );
  return onClick ? (
    <button type="button" className={cls} onClick={onClick} title={title}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

const pillTones = {
  ok: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  warn: "bg-amber-50 text-amber-800 ring-amber-600/20",
  bad: "bg-red-50 text-red-700 ring-red-600/20",
  teal: "bg-teal-50 text-teal-700 ring-teal-600/20",
  "": "bg-slate-100 text-slate-700 ring-slate-500/20",
} as const;

export function Pill({ tone = "", children }: { tone?: keyof typeof pillTones; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset", pillTones[tone])}>
      {children}
    </span>
  );
}

export const thCls = "px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-soft whitespace-nowrap text-left";
export const tdCls = "px-3 py-2 text-ink whitespace-nowrap";
export const numCls = "text-right tabular-nums";
export const stickyCls = "sticky left-0 z-10 bg-surface";
