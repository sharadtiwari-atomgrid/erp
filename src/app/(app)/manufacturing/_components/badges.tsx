import { Badge } from "@/components/ui/badge";
import { humanize } from "@/lib/format";

type Tone = "gray" | "blue" | "green" | "amber" | "red" | "violet";

/** Tones for manufacturing statuses (the shared StatusBadge doesn't know these). */
const TONES: Record<string, Tone> = {
  DRAFT: "gray",
  SCHEDULED: "blue",
  IN_PROGRESS: "violet",
  COMPLETED: "green",
  CANCELLED: "red",
  PLANNED: "gray",
  QC_PENDING: "amber",
  PASSED: "green",
  PARTIALLY_PASSED: "amber",
  FAILED: "red",
  ACTIVE: "green",
  MAINTENANCE: "amber",
  INACTIVE: "gray",
};

export function MfgStatusBadge({ status }: { status: string }) {
  return <Badge tone={TONES[status] ?? "gray"}>{humanize(status)}</Badge>;
}

const MODE_TONES: Record<string, Tone> = { MTS: "blue", MTO: "violet", ATO: "amber", BUY: "gray" };
const MODE_TITLES: Record<string, string> = { MTS: "Make to stock", MTO: "Make to order", ATO: "Assemble to order", BUY: "Bought" };

export function ModeBadge({ mode }: { mode: string }) {
  return (
    <span title={MODE_TITLES[mode]}>
      <Badge tone={MODE_TONES[mode] ?? "gray"}>{mode}</Badge>
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: number }) {
  const tone: Tone = priority <= 1 ? "red" : priority === 2 ? "amber" : "gray";
  return <Badge tone={tone}>P{priority}</Badge>;
}

export const PRIORITY_OPTIONS = [
  { value: 1, label: "1 — Urgent" },
  { value: 2, label: "2 — High" },
  { value: 3, label: "3 — Normal" },
  { value: 4, label: "4 — Low" },
  { value: 5, label: "5 — Lowest" },
];
