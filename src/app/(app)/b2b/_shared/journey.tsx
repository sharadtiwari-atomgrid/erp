/**
 * Shipment Journey: one shipment's whole story on one card: who owns it, each
 * milestone from PO to transporter payment (done / now / still to come / late), its
 * documents and the money. No hooks, so it renders in Server and Client Components.
 *
 *   import { ShipmentJourney, journeyFromMis } from "@/app/(app)/b2b/_shared/journey";
 *   <ShipmentJourney job={journeyFromMis(misJob, opsFiles)} />
 */
import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { todayIso } from "@/lib/ops/dates";
import { MIS_STATUS_LABELS } from "@/lib/ops/lists";
import { daysPastEta, journeySteps, type JourneyDocKey, type JourneyJob, type StepState } from "./journey-data";

export { journeyFromMis, journeyDocs, journeySteps, daysPastEta, etaOf, type JourneyJob, type JourneyStep } from "./journey-data";

const DOCS: Array<[JourneyDocKey, string]> = [
  ["taxInvoice", "Tax invoice"],
  ["eWayBill", "E-way bill"],
  ["coa", "COA"],
  ["transportDoc", "LR"],
  ["pod", "POD"],
];

const DOT: Record<StepState, string> = {
  done: "border-emerald-500 bg-emerald-500",
  now: "border-brand-600 bg-surface ring-4 ring-brand-500/15",
  late: "border-red-500 bg-surface ring-4 ring-red-500/15",
  todo: "border-line bg-surface",
};
const SUB: Record<StepState, string> = {
  done: "text-ink-soft",
  now: "font-semibold text-brand-700",
  late: "font-semibold text-red-600",
  todo: "text-ink-faint",
};

const inr = (v: number) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function ShipmentJourney({ job: e, compact = false, today = todayIso() }: { job: JourneyJob; compact?: boolean; today?: string }) {
  const steps = journeySteps(e, today);
  const doneN = steps.filter((s) => s.state === "done").length;
  const frac = steps.length > 1 ? Math.max(0, (doneN - 1) / (steps.length - 1)) : 0;
  const late = daysPastEta(e, today);
  const people = (
    [
      ["Demand", e.agDemandPoc, "bg-blue-50 text-blue-700"],
      ["Supply", e.agSupplyPoc, "bg-teal-50 text-teal-700"],
      ["Logistics", e.logisticsPoc, "bg-lime-50 text-lime-800"],
    ] as const
  ).filter(([, v]) => String(v ?? "").trim());
  const money = [
    e.transporterDetails ? String(e.transporterDetails).split(/\n/)[0] : "",
    e.totalLogisticsCost ? `Freight ${inr(e.totalLogisticsCost)}` : "",
    e.taxableValue ? `Taxable ${inr(e.taxableValue)}` : "",
    e.logisticsPaymentTerm ?? "",
  ].filter(Boolean);
  const subtitle = [
    e.productName,
    e.quantityKgs ? `${e.quantityKgs.toLocaleString("en-IN")} kg` : "",
    e.supplier ? `from ${e.supplier}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className={cn("rounded-lg border border-line bg-surface shadow-sm", compact ? "px-4 py-3" : "px-5 py-4")}>
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-ink">
            Job {e.jobNo || "—"} · {e.customer || "—"}
            {e.status && <span className="ml-2 text-xs font-medium text-ink-soft">({MIS_STATUS_LABELS[e.status as keyof typeof MIS_STATUS_LABELS] ?? e.status})</span>}
          </p>
          {subtitle && <p className="text-[13px] text-ink-soft">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {late > 0 && (
            <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
              {late} day{late > 1 ? "s" : ""} past ETA
            </span>
          )}
          {people.map(([k, v, tone]) => (
            <span key={k} className={cn("rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap", tone)}>
              {k}: {v}
            </span>
          ))}
        </div>
      </header>

      <ol
        className={cn("relative my-4 grid grid-cols-1 gap-2.5 sm:grid-cols-[repeat(var(--sj-n),minmax(0,1fr))] sm:gap-0", compact && "my-3")}
        style={{ "--sj-n": steps.length } as CSSProperties}
        aria-label="Shipment milestones"
      >
        <span
          aria-hidden
          className="absolute top-2.5 hidden h-1 rounded-full bg-muted sm:block"
          style={{ left: `calc(50% / ${steps.length})`, right: `calc(50% / ${steps.length})` }}
        />
        <span
          aria-hidden
          className="absolute top-2.5 hidden h-1 rounded-full bg-gradient-to-r from-brand-600 to-emerald-500 sm:block"
          style={{ left: `calc(50% / ${steps.length})`, width: `calc((100% - 100% / ${steps.length}) * ${frac})` }}
        />
        {steps.map((s) => (
          <li key={s.key} className="relative z-10 flex min-w-0 flex-row items-center gap-2 px-1 text-left sm:flex-col sm:gap-0.5 sm:text-center" title={`${s.label}: ${s.state}`}>
            <span aria-hidden className={cn("size-6 shrink-0 rounded-full sm:mb-1.5 border-[3px]", DOT[s.state])} />
            <b className={cn("text-[12.5px] leading-tight", s.state === "todo" ? "font-semibold text-ink-faint" : "font-semibold text-ink")}>{s.label}</b>
            <span className={cn("text-xs", SUB[s.state])}>{s.sub}</span>
            <span className="sr-only">({s.state})</span>
          </li>
        ))}
      </ol>

      <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-3">
        <div className="flex flex-wrap gap-1.5">
          {DOCS.map(([k, label]) => {
            const f = e.docs[k]?.[0];
            const cls = f
              ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"
              : "rounded-full border border-dashed border-line bg-muted px-2.5 py-1 text-xs font-semibold text-ink-faint";
            return f?.url ? (
              <a key={k} href={f.url} target="_blank" rel="noreferrer" className={cn(cls, "hover:underline")}>
                ✓ {label}
              </a>
            ) : (
              <span key={k} className={cls}>
                {f ? "✓ " : ""}
                {label}
              </span>
            );
          })}
        </div>
        {money.length > 0 && <div className="text-[12.5px] text-ink-soft">{money.join(" · ")}</div>}
      </footer>
    </article>
  );
}

export default ShipmentJourney;
