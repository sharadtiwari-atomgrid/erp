import Link from "next/link";
import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { todayIso } from "@/lib/ops/dates";
import { loadMisRows } from "../_lib/load";
import { dmy, istDay } from "../_lib/rows";
import { JobLink, Tag, Tile, WideTable, dash } from "../_lib/ui";
import {
  TRANSIT_FILTERS,
  matchesTransitFilter,
  reachingLabel,
  transitCounts,
  transitShipments,
  varianceLabel,
  type TransitFilter,
} from "../_lib/views";
import { ShipmentJourney, type JourneyJob } from "../../_shared/journey";
import type { MisRow } from "../_lib/rows";

export const metadata: Metadata = { title: "In transit" };

const KPIS: Array<{ key: TransitFilter; label: string; sub: string; tone: "default" | "teal" | "bad" | "violet" }> = [
  { key: "all", label: "In transit", sub: "currently moving", tone: "default" },
  { key: "today", label: "ETA today", sub: "expected today", tone: "teal" },
  { key: "overdue", label: "Overdue", sub: "ETA already passed", tone: "bad" },
  { key: "next3", label: "Next 3 days", sub: "due in 1–3 days", tone: "violet" },
  { key: "late", label: "Late vs plan", sub: "ETA after planned", tone: "bad" },
];

export default async function InTransitPage({ searchParams }: PageProps<"/b2b/views/intransit">) {
  await requireUser("b2bReports");
  const sp = await searchParams;
  const filter = (TRANSIT_FILTERS.find((f) => f.key === sp.f)?.key ?? "all") as TransitFilter;
  const mode = sp.view === "table" ? "table" : "journey";
  const today = todayIso();

  const all = transitShipments(await loadMisRows(), today);
  const counts = transitCounts(all);
  const shown = all.filter((s) => matchesTransitFilter(s, filter));
  const href = (f: TransitFilter, v: string = mode) => {
    const q = new URLSearchParams();
    if (f !== "all") q.set("f", f);
    if (v === "table") q.set("view", "table");
    const s = q.toString();
    return `/b2b/views/intransit${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader title="In-transit control tower" description={`${counts.all} shipment${counts.all === 1 ? "" : "s"} currently in transit · live from Domestic MIS.`} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {KPIS.map((k) => (
          <Tile
            key={k.key}
            label={k.label}
            value={counts[k.key]}
            sub={k.sub}
            tone={k.tone === "bad" && !counts[k.key] ? "default" : k.tone}
            href={href(k.key)}
            active={filter === k.key}
          />
        ))}
      </div>

      <p className="rounded-md border border-line bg-muted px-4 py-2 text-xs text-ink-soft">
        <b className="text-ink">How it works:</b> Overdue = should have reached already · ETA today = reaching today · Next 3 days = reaching in 1–3 days ·
        Late vs plan = expected arrival later than the planned ETA. ETA is the actual / tentative ETA, else the planned one.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {TRANSIT_FILTERS.map((f) => (
            <Link
              key={f.key}
              href={href(f.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                filter === f.key ? "border-brand-600 bg-brand-600 text-white" : "border-line bg-surface text-ink hover:bg-muted",
              )}
            >
              {f.label} ({counts[f.key]})
            </Link>
          ))}
        </div>
        <div className="inline-flex overflow-hidden rounded-md border border-line bg-surface text-xs font-semibold" role="group" aria-label="View">
          <Link href={href(filter, "journey")} className={cn("px-3 py-1.5", mode === "journey" ? "bg-brand-600 text-white" : "text-ink-soft hover:bg-muted")}>
            Journey
          </Link>
          <Link href={href(filter, "table")} className={cn("px-3 py-1.5", mode === "table" ? "bg-brand-600 text-white" : "text-ink-soft hover:bg-muted")}>
            Table
          </Link>
        </div>
      </div>
      <p className="text-xs text-ink-soft">
        Showing {shown.length} of {counts.all} in-transit shipments
      </p>

      {mode === "journey" ? (
        shown.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-faint">No in-transit shipments{filter !== "all" ? " in this filter" : ""}.</p>
        ) : (
          <div className="space-y-3">
            {[...shown]
              .sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9))
              .map((s) => (
                <ShipmentJourney key={s.e.id} job={toJourney(s.e)} today={today} />
              ))}
          </div>
        )
      ) : (
        <Card>
          <WideTable>
            <thead>
              <tr>
                <th>Job</th>
                <th>Customer</th>
                <th>PoC</th>
                <th>Actual ETD</th>
                <th>Reaching in</th>
                <th>ETA</th>
                <th>ETA variance</th>
                <th>Transit</th>
                <th>Transporter</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-ink-faint">
                    No in-transit shipments{filter !== "all" ? " in this filter" : ""}.
                  </td>
                </tr>
              ) : (
                shown.map((s) => {
                  const overdue = s.days !== null && s.days < 0;
                  const soon = s.days !== null && s.days >= 0 && s.days <= 3;
                  return (
                    <tr key={s.e.id}>
                      <td>
                        <JobLink id={s.e.id} jobNo={s.e.jobNo} />
                      </td>
                      <td>{dash(s.e.customer)}</td>
                      <td>{dash(s.e.logisticsPoc)}</td>
                      <td className="tabular-nums">{dash(dmy(s.e.actualEtd))}</td>
                      <td>
                        <Tag tone={overdue ? "bad" : soon ? "warn" : "good"}>{reachingLabel(s.days)}</Tag>
                      </td>
                      <td className="tabular-nums">{dash(dmy(s.e.actualEta || s.e.plannedEta))}</td>
                      <td className={cn(s.variance !== null && s.variance > 0 && "font-semibold text-red-600")}>{varianceLabel(s.variance)}</td>
                      <td className="tabular-nums">{s.transit === null ? "—" : `${s.transit}d`}</td>
                      <td>{dash(s.e.transporterDetails)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </WideTable>
        </Card>
      )}
    </div>
  );
}

/** MisRow → the Shipment Journey's job shape (documents by name). */
function toJourney(e: MisRow): JourneyJob {
  const { docs, ...rest } = e;
  return {
    ...rest,
    cxQuoteApprovalTime: istDay(e.cxQuoteApprovalTime) || null,
    sxReadinessTime: istDay(e.sxReadinessTime) || null,
    docs: Object.fromEntries(Object.entries(docs).map(([k, names]) => [k, names.map((name) => ({ name }))])),
  };
}
