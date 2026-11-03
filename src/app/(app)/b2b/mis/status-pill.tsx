import { Badge } from "@/components/ui/badge";
import { statusLabel } from "./_lib/fields";

const TONES: Record<string, "gray" | "blue" | "green" | "amber" | "red" | "violet"> = {
  FRESH_PO: "gray",
  PLANNED: "blue",
  MATERIAL_READY: "violet",
  INTRANSIT: "amber",
  DELIVERED: "green",
  ON_HOLD: "amber",
  CANCELLED: "red",
};

export function MisStatusPill({ status }: { status: string | null | undefined }) {
  if (!status) return <span className="text-ink-faint">—</span>;
  return <Badge tone={TONES[status] ?? "gray"}>{statusLabel(status)}</Badge>;
}
