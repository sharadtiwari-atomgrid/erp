import { Badge } from "@/components/ui/badge";
import { formatDate, humanize } from "@/lib/format";
import { daysUntil, expiryState } from "../_lib/fleet";

type Tone = "gray" | "blue" | "green" | "amber" | "red" | "violet";

/** Colours for logistics, e-way bill and return statuses (the shared StatusBadge doesn't know these). */
const TONES: Record<string, Tone> = {
  // Trips
  PLANNED: "blue",
  IN_TRANSIT: "violet",
  COMPLETED: "green",
  CANCELLED: "red",
  // Vehicles
  AVAILABLE: "green",
  ON_TRIP: "violet",
  MAINTENANCE: "amber",
  INACTIVE: "gray",
  OWN: "blue",
  THIRD_PARTY: "amber",
  // Outbound
  PACKED: "amber",
  DISPATCHED: "green",
  // Shipping documents
  ASN: "blue",
  DN: "violet",
  DELIVERED: "green",
  // E-way bills
  ACTIVE: "green",
  EXPIRED: "red",
  // Returns
  REQUESTED: "blue",
  RECEIVED: "amber",
  INSPECTED: "violet",
  CLOSED: "green",
  PENDING: "gray",
  REPAIR: "amber",
  REPAIRED: "green",
  RESTOCK: "green",
  SCRAP: "red",
};

const LABELS: Record<string, string> = { ASN: "ASN", DN: "Delivery note", THIRD_PARTY: "Third-party" };

export function OpsBadge({ status, label }: { status: string; label?: string }) {
  return <Badge tone={TONES[status] ?? "gray"}>{label ?? LABELS[status] ?? humanize(status)}</Badge>;
}

/** Expiry date with a red "Expired" or amber "Expires in N days" badge (within 30 days). */
export function ExpiryValue({ until, now }: { until: Date | null; now: Date }) {
  const state = expiryState(until, now);
  if (!until || state === "none") return <span className="text-ink-faint">—</span>;
  const days = daysUntil(until, now);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span>{formatDate(until)}</span>
      {state === "expired" && <Badge tone="red">Expired</Badge>}
      {state === "expiring" && <Badge tone="amber">{days === 0 ? "Expires today" : `Expires in ${days} day${days === 1 ? "" : "s"}`}</Badge>}
    </span>
  );
}

/** Compact badge for list rows: nothing when valid. */
export function ExpiryFlag({ until, now, label }: { until: Date | null; now: Date; label: string }) {
  const state = expiryState(until, now);
  if (state === "expired") return <Badge tone="red">{label} expired</Badge>;
  if (state === "expiring") return <Badge tone="amber">{label} expiring</Badge>;
  return null;
}
