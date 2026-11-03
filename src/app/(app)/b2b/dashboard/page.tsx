import Link from "next/link";
import type { Metadata } from "next";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { MIS_STATUS_LABELS } from "@/lib/ops/lists";
import { todayIso } from "@/lib/ops/dates";
import type { MisStatus } from "@/generated/prisma/enums";
import { loadMisRows } from "../views/_lib/load";
import { dmy, hasDoc } from "../views/_lib/rows";
import { JobLink, MisStatusBadge, Tile, WideTable, dash, kg } from "../views/_lib/ui";
import {
  FILTER_KEYS,
  PAY_BUCKETS,
  applyFilters,
  dashboardMetrics,
  detailRows,
  donutSlices,
  etaDelta,
  filterOptions,
  readFilters,
  type Count,
  type Filters,
  type PayBucket,
} from "./_lib/kpis";

export const metadata: Metadata = { title: "B2B dashboard" };

// Accessible chart palette on a light background.
const PALETTE = ["#1b7f4a", "#0f7c8a", "#9b8fe0", "#2f6fe4", "#d9a640", "#c0362c", "#8b97ad", "#5b4bc4"];

function qs(f: Filters, extra: Record<string, string> = {}) {
  const sp = new URLSearchParams();
  for (const k of FILTER_KEYS) if (f[k]) sp.set(k, f[k]);
  for (const [k, v] of Object.entries(extra)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export default async function B2bDashboardPage({ searchParams }: PageProps<"/b2b/dashboard">) {
  await requireUser("b2bReports");
  const sp = await searchParams;
  const f = readFilters(sp);
  const payParam = typeof sp.pay === "string" ? sp.pay : "";
  const payBucket = PAY_BUCKETS.some((b) => b.key === payParam) ? (payParam as PayBucket) : "";

  const rows = await loadMisRows();
  const opts = filterOptions(rows);
  const filtered = applyFilters(rows, f);
  const m = dashboardMetrics(filtered);
  const active = FILTER_KEYS.some((k) => f[k]);
  const month = todayIso().slice(0, 7);

  const select = (name: keyof Filters, label: string, all: string, options: string[], show: (v: string) => string = (v) => v) => (
    <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
      {label}
      <Select name={name} defaultValue={f[name]}>
        <option value="">{all}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {show(o)}
          </option>
        ))}
      </Select>
    </label>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Domestic MIS — shipment execution dashboard"
        description="Live overview across all Domestic MIS jobs."
        actions={
          <form action="/b2b/dashboard/mis-pack" method="get" className="flex items-center gap-2">
            <Input type="month" name="month" defaultValue={month} aria-label="Month for the MIS pack" className="w-auto" required />
            <button type="submit" className={buttonClass("primary")} title="Summary, by customer, by product, dispatched, delivered and payables — one workbook">
              Monthly MIS pack
            </button>
          </form>
        }
      />

      {rows.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center text-sm text-ink-soft">No shipment data yet. Add or import jobs in Domestic MIS and the dashboard fills in.</CardBody>
        </Card>
      ) : (
        <>
          <Card>
            <form className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-3 lg:grid-cols-5" role="search">
              {select("month", "Planned ETD month", "All months", opts.month)}
              {select("customer", "Customer", "All customers", opts.customer)}
              {select("supplier", "Supplier", "All suppliers", opts.supplier)}
              {select("poc", "AG Demand POC", "All POCs", opts.poc)}
              {select("status", "Status", "All statuses", opts.status, (s) => MIS_STATUS_LABELS[s as MisStatus] ?? s)}
              {select("logisticsType", "Logistics type", "All types", opts.logisticsType)}
              {select("paymentTerm", "Payment term", "All payment terms", opts.paymentTerm)}
              {select("paymentStatus", "Payment status", "All payment statuses", opts.paymentStatus)}
              <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
                Quick search
                <Input name="q" defaultValue={f.q} placeholder="Job / customer / supplier / product…" />
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <button type="submit" className={buttonClass("secondary")}>
                  Apply
                </button>
                {active && (
                  <Link href="/b2b/dashboard" className={buttonClass("ghost")}>
                    Reset
                  </Link>
                )}
                <a href={`/b2b/dashboard/export${qs(f)}`} className={buttonClass("secondary")}>
                  Export CSV
                </a>
              </div>
            </form>
          </Card>

          <p className="text-xs text-ink-soft">
            Showing {filtered.length} of {rows.length} shipments{active ? " (filtered)" : ""}.
          </p>

          {filtered.length === 0 ? (
            <Card>
              <CardBody className="py-12 text-center text-sm text-ink-soft">No shipments match these filters.</CardBody>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Tile label="Total shipments" value={m.total} sub={`${m.deliveredN} delivered · ${m.transitN} in transit`} />
                <Tile label="On-time ETA" value={m.onTimePct === null ? "—" : `${m.onTimePct}%`} sub="delivered vs planned ETA" tone="good" />
                <Tile label="Avg delay (late)" value={`${m.avgDelay}d`} sub="among delayed only" tone="bad" />
                <Tile label="POD received" value={`${m.podPct}%`} sub={`${m.podN} of ${m.total}`} tone="teal" />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Card>
                  <CardHeader title="Status breakdown" />
                  <CardBody>
                    <Donut counts={m.status} total={m.total} />
                  </CardBody>
                </Card>
                <BarCard title="Logistics type" data={m.logistics} />
                <BarCard title="Payment terms" data={m.payment} />
                <Card>
                  <CardHeader title="Documentation completeness" />
                  <CardBody className="space-y-3">
                    {m.docs.map((d) => {
                      const pct = m.total ? Math.round((d.n / m.total) * 100) : 0;
                      return (
                        <div key={d.label}>
                          <div className="mb-1 flex justify-between text-xs font-medium text-ink">
                            <span>{d.label}</span>
                            <span className="tabular-nums">
                              {d.n} / {m.total} ({pct}%)
                            </span>
                          </div>
                          <Bar pct={pct} />
                        </div>
                      );
                    })}
                  </CardBody>
                </Card>
              </div>

              <Card>
                <CardHeader
                  title="Transport payment — done or pending"
                  actions={
                    <span className="text-sm font-semibold text-emerald-700">
                      {m.paidPct === null ? "—" : `${m.paidPct}% paid`} <span className="text-xs font-normal text-ink-soft">of {m.payable} payable</span>
                    </span>
                  }
                />
                <CardBody className="space-y-3">
                  <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
                    {m.payable > 0 && (
                      <>
                        <div className="bg-emerald-600" style={{ width: `${(m.pay.paid / m.payable) * 100}%` }} title={`Paid: ${m.pay.paid}`} />
                        <div className="bg-amber-400" style={{ width: `${(m.pay.partial / m.payable) * 100}%` }} title={`Partially paid: ${m.pay.partial}`} />
                        <div className="bg-blue-500" style={{ width: `${(m.pay.pending / m.payable) * 100}%` }} title={`Pending: ${m.pay.pending}`} />
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {PAY_BUCKETS.map((b) => (
                      <Link
                        key={b.key}
                        href={`/b2b/dashboard${qs(f, { pay: payBucket === b.key ? "" : b.key })}`}
                        scroll={false}
                        className={cn(
                          "flex items-baseline gap-1.5 rounded-md border px-3 py-1 text-xs",
                          payBucket === b.key ? "border-brand-500 ring-2 ring-brand-500/30" : "border-line",
                          b.key === "paid" && "bg-emerald-50",
                          b.key === "partial" && "bg-amber-50",
                          b.key === "pending" && "bg-red-50",
                          (b.key === "na" || b.key === "unknown") && "bg-muted",
                        )}
                        title="Show the job numbers"
                      >
                        <b className="text-sm tabular-nums text-ink">{m.pay[b.key]}</b>
                        <span className="font-medium text-ink-soft">{b.label}</span>
                      </Link>
                    ))}
                  </div>
                  {payBucket && (
                    <div className="border-t border-dashed border-line pt-3">
                      <p className="mb-2 text-xs font-semibold text-ink-soft">
                        {m.payRows[payBucket].length} shipment{m.payRows[payBucket].length === 1 ? "" : "s"} ·{" "}
                        {PAY_BUCKETS.find((b) => b.key === payBucket)?.label}
                      </p>
                      {m.payRows[payBucket].length === 0 ? (
                        <p className="text-xs text-ink-faint">No shipments in this bucket.</p>
                      ) : (
                        <WideTable>
                          <thead>
                            <tr>
                              <th>Job</th>
                              <th>Customer</th>
                              <th>Payment status</th>
                              <th>Payment term</th>
                              <th className="text-right">Total cost</th>
                              <th className="text-right">AG to pay</th>
                              <th className="text-right">Cx to pay</th>
                              <th>Transporter</th>
                              <th>POD</th>
                            </tr>
                          </thead>
                          <tbody>
                            {m.payRows[payBucket].map((e) => (
                              <tr key={e.id}>
                                <td>
                                  <JobLink id={e.id} jobNo={e.jobNo} />
                                </td>
                                <td>{dash(e.customer)}</td>
                                <td>{dash(e.transportPaymentStatus)}</td>
                                <td>{dash(e.logisticsPaymentTerm)}</td>
                                <td className="text-right tabular-nums">{e.totalLogisticsCost === null ? "—" : `₹${kg(e.totalLogisticsCost)}`}</td>
                                <td className="text-right tabular-nums">{e.logisticsCostAgToPay === null ? "—" : `₹${kg(e.logisticsCostAgToPay)}`}</td>
                                <td className="text-right tabular-nums">
                                  {e.totalLogisticsCost !== null && e.logisticsCostAgToPay !== null ? `₹${kg(e.totalLogisticsCost - e.logisticsCostAgToPay)}` : "—"}
                                </td>
                                <td>{dash(e.transporterDetails)}</td>
                                <td>{e.docs.pod.length ? `✓ ${e.docs.pod.join(", ")}` : "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </WideTable>
                      )}
                    </div>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Shipment detail & payment status (filtered)" />
                <WideTable>
                  <thead>
                    <tr>
                      <th>Job No.</th>
                      <th>Customer</th>
                      <th>Supplier</th>
                      <th>Product</th>
                      <th className="text-right">Qty (kg)</th>
                      <th>Planned ETD</th>
                      <th>Planned ETA</th>
                      <th>Actual ETA</th>
                      <th>ETA Δ</th>
                      <th>Status</th>
                      <th>Payment term</th>
                      <th>Payment status</th>
                      <th>Docs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailRows(filtered).map((e) => {
                      const v = etaDelta(e);
                      return (
                        <tr key={e.id}>
                          <td>
                            <JobLink id={e.id} jobNo={e.jobNo} />
                          </td>
                          <td>{dash(e.customer)}</td>
                          <td>{dash(e.supplier)}</td>
                          <td>{dash(e.productName)}</td>
                          <td className="text-right tabular-nums">{kg(e.quantityKgs)}</td>
                          <td className="tabular-nums">{dash(dmy(e.plannedEtd))}</td>
                          <td className="tabular-nums">{dash(dmy(e.plannedEta))}</td>
                          <td className="tabular-nums">{dash(dmy(e.actualEta))}</td>
                          <td className={cn(v !== null && v > 0 && "font-semibold text-red-600")}>
                            {v === null ? "—" : v > 0 ? `Late ${v}d` : v < 0 ? `${-v}d early` : "On plan"}
                          </td>
                          <td>
                            <MisStatusBadge status={e.status} />
                          </td>
                          <td>{dash(e.logisticsPaymentTerm)}</td>
                          <td>{dash(e.transportPaymentStatus)}</td>
                          <td>
                            <span className="flex gap-0.5">
                              {(
                                [
                                  ["T", "taxInvoice", "Tax invoice"],
                                  ["E", "eWayBill", "E-way bill"],
                                  ["C", "coa", "COA"],
                                  ["P", "pod", "POD"],
                                ] as const
                              ).map(([l, k, t]) => (
                                <span
                                  key={k}
                                  title={t}
                                  className={cn(
                                    "inline-flex size-4 items-center justify-center rounded text-[9px] font-bold",
                                    hasDoc(e, k) ? "bg-emerald-100 text-emerald-700" : "bg-muted text-ink-faint",
                                  )}
                                >
                                  {l}
                                </span>
                              ))}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </WideTable>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Bar({ pct }: { pct: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-brand-50">
      <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
    </div>
  );
}

function BarCard({ title, data }: { title: string; data: Count[] }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  return (
    <Card>
      <CardHeader title={title} />
      <CardBody className="space-y-2.5">
        {data.length === 0 ? (
          <p className="text-sm text-ink-soft">No data.</p>
        ) : (
          data.map((d) => (
            <div key={d.key}>
              <div className="mb-1 flex justify-between text-xs text-ink">
                <span className="truncate">{d.label}</span>
                <span className="tabular-nums">{d.n}</span>
              </div>
              <Bar pct={(d.n / max) * 100} />
            </div>
          ))
        )}
      </CardBody>
    </Card>
  );
}

/** SVG donut: one arc per status. */
function Donut({ counts, total }: { counts: Count[]; total: number }) {
  const r = 50,
    c = 65,
    w = 24;
  const arc = (start: number, end: number) => {
    if (end - start >= 359.999) return null;
    const p = (deg: number) => {
      const a = ((deg - 90) * Math.PI) / 180;
      return `${c + r * Math.cos(a)} ${c + r * Math.sin(a)}`;
    };
    return `M ${p(start)} A ${r} ${r} 0 ${end - start > 180 ? 1 : 0} 1 ${p(end)}`;
  };
  const slices = donutSlices(counts);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 130 130" className="size-32 flex-none" role="img" aria-label="Status breakdown">
        <circle cx={c} cy={c} r={r} fill="none" strokeWidth={w} className="stroke-muted" />
        {slices.map((s, i) => {
          const d = arc(s.start, s.end);
          const color = PALETTE[i % PALETTE.length];
          return d === null ? (
            <circle key={s.key} cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={w} />
          ) : (
            <path key={s.key} d={d} fill="none" stroke={color} strokeWidth={w} />
          );
        })}
        <text x={c} y={c} textAnchor="middle" className="fill-ink text-[22px] font-semibold">
          {total}
        </text>
        <text x={c} y={c + 14} textAnchor="middle" className="fill-ink-soft text-[9px] uppercase">
          total
        </text>
      </svg>
      <ul className="grid gap-1 text-xs text-ink">
        {slices.map((s, i) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className="size-2.5 flex-none rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
            {s.label}
            <b className="ml-auto pl-3 tabular-nums">{s.n}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
