import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { humanize } from "@/lib/format";

type Tone = "gray" | "blue" | "green" | "amber" | "red" | "violet";

const tones: Record<Tone, string> = {
  gray: "bg-slate-100 text-slate-700 ring-slate-500/20",
  blue: "bg-blue-50 text-blue-700 ring-blue-600/20",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/20",
};

export function Badge({ tone = "gray", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap", tones[tone])}>
      {children}
    </span>
  );
}

/** Colour for every document/record status in the schema. */
const STATUS_TONES: Record<string, Tone> = {
  DRAFT: "gray",
  NEW: "blue",
  CONTACTED: "violet",
  QUALIFIED: "amber",
  SENT: "blue",
  ORDERED: "blue",
  ISSUED: "blue",
  CONFIRMED: "blue",
  ACCEPTED: "green",
  CONVERTED: "green",
  DELIVERED: "green",
  RECEIVED: "green",
  PAID: "green",
  PARTIALLY_DELIVERED: "amber",
  PARTIALLY_RECEIVED: "amber",
  PARTIALLY_PAID: "amber",
  OVERDUE: "red",
  REJECTED: "red",
  LOST: "red",
  EXPIRED: "red",
  CANCELLED: "red",
  ACTIVE: "green",
  INACTIVE: "gray",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONES[status] ?? "gray"}>{humanize(status)}</Badge>;
}
