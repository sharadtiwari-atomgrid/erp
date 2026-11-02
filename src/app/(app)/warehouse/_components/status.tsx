import { Badge } from "@/components/ui/badge";
import { humanize } from "@/lib/format";

type Tone = "gray" | "blue" | "green" | "amber" | "red" | "violet";

/** Colours for inbound, outbound, session and QC statuses. */
const TONES: Record<string, Tone> = {
  QC_PENDING: "amber",
  COMPLETED: "green",
  CANCELLED: "red",
  PENDING: "gray",
  PICKING: "blue",
  PICKED: "violet",
  PACKING: "blue",
  PACKED: "violet",
  DISPATCHED: "green",
  OPEN: "blue",
  PASSED: "green",
  PARTIAL: "amber",
  FAILED: "red",
};

export function WarehouseStatusBadge({ status }: { status: string }) {
  return <Badge tone={TONES[status] ?? "gray"}>{humanize(status)}</Badge>;
}

/** Steps of the outbound flow, for the progress strip on the detail page. */
const OUTBOUND_STEPS = ["PENDING", "PICKING", "PICKED", "PACKING", "PACKED", "DISPATCHED"] as const;

export function OutboundSteps({ status }: { status: string }) {
  const current = OUTBOUND_STEPS.indexOf(status as (typeof OUTBOUND_STEPS)[number]);
  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs">
      {OUTBOUND_STEPS.map((step, i) => {
        const done = status !== "CANCELLED" && i < current;
        const active = i === current;
        return (
          <li key={step} className="flex items-center gap-1">
            <span
              className={
                active
                  ? "rounded-full bg-brand-600 px-2.5 py-1 font-medium text-white"
                  : done
                    ? "rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700"
                    : "rounded-full bg-muted px-2.5 py-1 text-ink-faint"
              }
            >
              {humanize(step)}
            </span>
            {i < OUTBOUND_STEPS.length - 1 && <span className="text-ink-faint">→</span>}
          </li>
        );
      })}
    </ol>
  );
}
