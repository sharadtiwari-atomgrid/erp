import Link from "next/link";
import type { ReactNode } from "react";
import type { MisStatus } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { statusLabel } from "./rows";

/** Small shared pieces for the B2B views, Today and the dashboard. */

const STATUS_TONE: Record<MisStatus, "gray" | "blue" | "green" | "amber" | "red" | "violet"> = {
  FRESH_PO: "gray",
  PLANNED: "blue",
  MATERIAL_READY: "violet",
  INTRANSIT: "amber",
  DELIVERED: "green",
  ON_HOLD: "gray",
  CANCELLED: "red",
};

export function MisStatusBadge({ status }: { status: MisStatus | null }) {
  if (!status) return <span className="text-ink-faint">—</span>;
  return <Badge tone={STATUS_TONE[status]}>{statusLabel(status)}</Badge>;
}

/** Link to a Domestic MIS job. */
export function JobLink({ id, jobNo }: { id: string; jobNo: string }) {
  return (
    <Link href={`/b2b/mis?edit=${encodeURIComponent(id)}`} className="font-semibold text-brand-700 hover:underline">
      {jobNo || "—"}
    </Link>
  );
}

export function Tile({
  label,
  value,
  sub,
  tone = "default",
  href,
  active,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "good" | "warn" | "bad" | "teal" | "violet";
  href?: string;
  active?: boolean;
}) {
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</p>
      <p
        className={cn(
          "mt-1.5 text-2xl font-semibold tabular-nums",
          tone === "good" && "text-emerald-600",
          tone === "warn" && "text-amber-600",
          tone === "bad" && "text-red-600",
          tone === "teal" && "text-teal-600",
          tone === "violet" && "text-violet-600",
          tone === "default" && "text-ink",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-ink-soft">{sub}</p>}
    </>
  );
  const cls = cn("block rounded-lg border bg-surface px-4 py-3 shadow-sm", active ? "border-brand-500 ring-2 ring-brand-500/30" : "border-line");
  return href ? (
    <Link href={href} className={cn(cls, "hover:bg-muted/40")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Dense table cell helpers. */
export const kg = (v: number | null | undefined) => (v === null || v === undefined ? "—" : formatNumber(v));
export const dash = (v: ReactNode) => (v === null || v === undefined || v === "" ? "—" : v);

export function Tag({ tone, children }: { tone: "good" | "warn" | "bad" | "muted"; children: ReactNode }) {
  return <Badge tone={tone === "good" ? "green" : tone === "warn" ? "amber" : tone === "bad" ? "red" : "gray"}>{children}</Badge>;
}

/** Sticky-first-column dense table wrapper for wide ops tables. */
export function WideTable({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table
        className={cn(
          "min-w-full border-collapse text-xs [&_td]:border-b [&_td]:border-line [&_td]:px-3 [&_td]:py-2 [&_td]:whitespace-nowrap [&_th]:border-b [&_th]:border-line [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-ink-soft [&_th]:whitespace-nowrap [&_tbody_tr:hover_td]:bg-muted/40 [&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:bg-surface [&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:z-10",
          className,
        )}
      >
        {children}
      </table>
    </div>
  );
}
