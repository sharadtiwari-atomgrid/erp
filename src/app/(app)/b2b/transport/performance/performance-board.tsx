"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { formatDmy } from "@/lib/ops/dates";
import {
  PERFORMANCE_CSV_HEADER, PERFORMANCE_PERIODS, buildPerformance, makeTransporterResolver, onTimeTone,
  performanceCsvRow, podTone, type PerformanceRow,
} from "@/lib/ops/transport";
import type { PlainTransportJob } from "../data";
import { Pill, Tile, downloadCsv, inr, inr2, numCls, stickyCls, tdCls, thCls, toneText } from "../ui";

type SortKey = keyof Pick<
  PerformanceRow,
  "name" | "delivered" | "avgTat" | "onTime" | "late" | "onTimePct" | "lateDays" | "lateFreight" | "lateValue" | "perKg" | "freight" | "pod" | "podMissing"
>;
const d1 = (n: number | null) => (n === null ? "—" : `${n.toFixed(1)} d`);

export function PerformanceBoard({ jobs, transporterNames, today }: { jobs: PlainTransportJob[]; transporterNames: string[]; today: string }) {
  const [period, setPeriod] = useState("90");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<[SortKey, "asc" | "desc"]>(["delivered", "desc"]);
  const [open, setOpen] = useState("");
  const [rowFilter, setRowFilter] = useState<"all" | "late" | "nopod">("all");

  const resolve = useMemo(() => makeTransporterResolver(transporterNames), [transporterNames]);
  const { rows, total, inTransit, noTransporter } = useMemo(() => buildPerformance(jobs, resolve, period, today), [jobs, resolve, period, today]);

  const sorted = useMemo(() => {
    const [k, dir] = sort;
    const t = search.trim().toLowerCase();
    return rows
      .filter((r) => !t || r.name.toLowerCase().includes(t))
      .sort((a, b) => {
        const x = a[k], y = b[k];
        if (x === null && y === null) return 0;
        if (x === null) return 1;
        if (y === null) return -1;
        const c = typeof x === "string" ? x.localeCompare(String(y)) : (x as number) - (y as number);
        return dir === "asc" ? c : -c;
      });
  }, [rows, sort, search]);

  function th(k: SortKey, label: string, left = false) {
    const on = sort[0] === k;
    return (
      <th
        key={k}
        className={cn(thCls, "cursor-pointer select-none hover:text-ink", !left && numCls, left && cn(stickyCls, "bg-muted"))}
        onClick={() => setSort([k, on && sort[1] === "desc" ? "asc" : "desc"])}
      >
        {label}
        {on ? (sort[1] === "desc" ? " ↓" : " ↑") : ""}
      </th>
    );
  }

  function exportCsv() {
    downloadCsv(`transport-performance-${today}.csv`, PERFORMANCE_CSV_HEADER, sorted.map(performanceCsvRow));
  }

  const onTimeT = onTimeTone(total.onTimePct);
  const podT = podTone(total.podPct);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select className="w-auto" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period">
          {PERFORMANCE_PERIODS.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
        <Input className="max-w-xs" placeholder="Search transporter…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
        <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!sorted.length}>
          Export CSV ↓
        </Button>
        <span className="text-xs text-ink-faint">
          By delivery date · {inTransit} shipment{inTransit === 1 ? "" : "s"} still in transit not counted
        </span>
      </div>

      {noTransporter > 0 && (
        <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠ {noTransporter} delivered shipment{noTransporter > 1 ? "s have" : " has"} no Transporter Details in Domestic MIS and {noTransporter > 1 ? "aren't" : "isn't"} counted.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Tile value={total.delivered} label="Shipments delivered" sub={`${rows.length} transporters`} />
        <Tile value={d1(total.avgTat)} label="Avg TAT" sub="dispatch → delivery" />
        <Tile
          value={total.onTimePct === null ? "—" : `${total.onTimePct}%`}
          label="On time"
          sub={`${total.onTime} on time · ${total.late} delayed`}
          tone={onTimeT === "none" ? "" : onTimeT}
        />
        <Tile value={`${total.lateDays} d`} label="Total delay" sub={`avg ${d1(total.avgDelay)} per delayed shipment`} tone={total.late ? "bad" : ""} />
        <Tile value={inr(total.lateValue)} label="Cargo value delivered late" sub={`freight on these: ${inr(total.lateFreight)}`} tone={total.late ? "warn" : ""} />
        <Tile value={total.perKg === null ? "—" : inr2(total.perKg)} label="Avg rate per kg" sub={`freight ${inr(total.freight)}`} />
        <Tile
          value={total.podPct === null ? "—" : `${total.podPct}%`}
          label="POD received"
          sub={`${total.pod} received · ${total.podMissing} missing`}
          tone={podT === "none" ? "" : podT}
        />
      </div>

      <Card>
        <CardHeader title="By transporter" description="Click a column to sort · click a transporter to see its shipments" />
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-line text-sm">
            <thead className="bg-muted/60">
              <tr className="text-center text-xs text-ink-soft">
                <th className={cn(stickyCls, "bg-muted")} />
                <th colSpan={2} className="px-3 pt-2">Speed</th>
                <th colSpan={3} className="px-3 pt-2">On time vs delayed</th>
                <th colSpan={3} className="px-3 pt-2">Cost of delay</th>
                <th colSpan={2} className="px-3 pt-2">Rate</th>
                <th colSpan={2} className="px-3 pt-2">POD</th>
              </tr>
              <tr>
                {th("name", "Transporter", true)}
                {th("delivered", "Delivered")}
                {th("avgTat", "Avg TAT")}
                {th("onTime", "On time")}
                {th("late", "Delayed")}
                {th("onTimePct", "On-time %")}
                {th("lateDays", "Delay days")}
                {th("lateFreight", "Freight on delayed")}
                {th("lateValue", "Cargo value delayed")}
                {th("perKg", "Avg ₹/kg")}
                {th("freight", "Freight")}
                {th("pod", "Received")}
                {th("podMissing", "Missing")}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-4 py-10 text-center text-ink-faint">No delivered shipments in this period.</td>
                </tr>
              ) : (
                sorted.map((r) => {
                  const isOpen = open === r.name;
                  const list = r.rows
                    .filter((x) => rowFilter === "all" || (rowFilter === "late" ? x.late : !x.pod))
                    .sort((a, b) => (b.delay ?? -99) - (a.delay ?? -99));
                  return (
                    <Fragment key={r.name}>
                      <tr
                        className={cn("cursor-pointer hover:bg-muted/40", isOpen && "bg-muted/40")}
                        onClick={() => {
                          setOpen(isOpen ? "" : r.name);
                          setRowFilter("all");
                        }}
                      >
                        <td className={cn(tdCls, stickyCls)}>
                          {isOpen ? "▾" : "▸"} <b>{r.name}</b>
                        </td>
                        <td className={cn(tdCls, numCls)}>{r.delivered}</td>
                        <td className={cn(tdCls, numCls)}>{d1(r.avgTat)}</td>
                        <td className={cn(tdCls, numCls, "text-emerald-700")}>{r.onTime}</td>
                        <td className={cn(tdCls, numCls, r.late ? "text-red-700" : "text-ink-faint")}>{r.late}</td>
                        <td className={cn(tdCls, numCls)}>
                          <span className={toneText[onTimeTone(r.onTimePct)]}>{r.onTimePct === null ? "—" : `${r.onTimePct}%`}</span>
                          {r.onTimePct !== null && (
                            <span className="ml-2 inline-block h-1.5 w-12 overflow-hidden rounded-full bg-muted align-middle">
                              <i className="block h-full bg-emerald-500" style={{ width: `${r.onTimePct}%` }} />
                            </span>
                          )}
                        </td>
                        <td className={cn(tdCls, numCls)}>
                          {r.late ? (
                            <>
                              {r.lateDays} d <span className="text-ink-faint">(avg {(r.avgDelay ?? 0).toFixed(1)})</span>
                            </>
                          ) : (
                            <span className="text-ink-faint">—</span>
                          )}
                        </td>
                        <td className={cn(tdCls, numCls)}>{r.late ? inr(r.lateFreight) : <span className="text-ink-faint">—</span>}</td>
                        <td className={cn(tdCls, numCls)}>{r.late ? inr(r.lateValue) : <span className="text-ink-faint">—</span>}</td>
                        <td className={cn(tdCls, numCls)}>{r.perKg === null ? <span className="text-ink-faint">—</span> : inr2(r.perKg)}</td>
                        <td className={cn(tdCls, numCls)}>{r.freight ? inr(r.freight) : <span className="text-ink-faint">—</span>}</td>
                        <td className={cn(tdCls, numCls)}>
                          <span className={toneText[podTone(r.podPct)]}>{r.pod}</span> <span className="text-ink-faint">({r.podPct ?? 0}%)</span>
                        </td>
                        <td className={cn(tdCls, numCls, r.podMissing ? "text-red-700" : "text-ink-faint")}>{r.podMissing}</td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={13} className="bg-muted/20 px-4 pt-2 pb-3 pl-8">
                            <div className="mb-2 flex flex-wrap gap-1.5">
                              {(
                                [
                                  ["all", `All ${r.delivered}`],
                                  ["late", `Delayed ${r.late}`],
                                  ["nopod", `POD missing ${r.podMissing}`],
                                ] as const
                              ).map(([k, l]) => (
                                <Button key={k} size="sm" variant={rowFilter === k ? "primary" : "secondary"} onClick={() => setRowFilter(k)}>
                                  {l}
                                </Button>
                              ))}
                            </div>
                            <table className="min-w-full text-sm">
                              <thead>
                                <tr>
                                  {["Job No.", "Customer", "Dispatched", "Planned ETA", "Delivered"].map((h) => (
                                    <th key={h} className={thCls}>{h}</th>
                                  ))}
                                  {["TAT", "Delay", "Freight", "₹/kg", "Cargo value"].map((h) => (
                                    <th key={h} className={cn(thCls, numCls)}>{h}</th>
                                  ))}
                                  <th className={thCls}>POD</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-line">
                                {list.length === 0 ? (
                                  <tr>
                                    <td colSpan={11} className="px-4 py-6 text-center text-ink-faint">Nothing here.</td>
                                  </tr>
                                ) : (
                                  list.slice(0, 50).map((x) => (
                                    <tr key={x.id}>
                                      <td className={tdCls}>
                                        <Link href={`/b2b/mis?q=${encodeURIComponent(x.jobNo)}`} className="font-medium text-brand-700 hover:underline">
                                          {x.jobNo || "—"}
                                        </Link>
                                      </td>
                                      <td className={tdCls}>{x.customer || "—"}</td>
                                      <td className={tdCls}>{formatDmy(x.actualEtd) || "—"}</td>
                                      <td className={tdCls}>{formatDmy(x.plannedEta) || "—"}</td>
                                      <td className={tdCls}>{formatDmy(x.actualEta) || "—"}</td>
                                      <td className={cn(tdCls, numCls)}>{x.tat === null ? "—" : `${x.tat} d`}</td>
                                      <td className={cn(tdCls, numCls)}>
                                        {x.delay === null ? (
                                          <span className="text-ink-faint">—</span>
                                        ) : x.late ? (
                                          <span className="text-red-700">{x.delay} d late</span>
                                        ) : (
                                          <span className="text-emerald-700">on time</span>
                                        )}
                                      </td>
                                      <td className={cn(tdCls, numCls)}>{x.cost ? inr(x.cost) : "—"}</td>
                                      <td className={cn(tdCls, numCls)}>{x.cost && x.kg ? inr2(x.cost / x.kg) : "—"}</td>
                                      <td className={cn(tdCls, numCls)}>{x.value ? inr(x.value) : "—"}</td>
                                      <td className={tdCls}>{x.pod ? <Pill tone="ok">✓ received</Pill> : <Pill tone="bad">missing</Pill>}</td>
                                    </tr>
                                  ))
                                )}
                              </tbody>
                            </table>
                            {list.length > 50 && <p className="mt-2 text-xs text-ink-soft">Showing 50 of {list.length}. Export CSV for everything.</p>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
            {sorted.length > 1 && (
              <tfoot className="bg-muted/60 font-semibold">
                <tr>
                  <td className={cn(tdCls, stickyCls, "bg-muted")}>All transporters</td>
                  <td className={cn(tdCls, numCls)}>{total.delivered}</td>
                  <td className={cn(tdCls, numCls)}>{d1(total.avgTat)}</td>
                  <td className={cn(tdCls, numCls)}>{total.onTime}</td>
                  <td className={cn(tdCls, numCls)}>{total.late}</td>
                  <td className={cn(tdCls, numCls)}>{total.onTimePct ?? "—"}%</td>
                  <td className={cn(tdCls, numCls)}>{total.lateDays} d</td>
                  <td className={cn(tdCls, numCls)}>{inr(total.lateFreight)}</td>
                  <td className={cn(tdCls, numCls)}>{inr(total.lateValue)}</td>
                  <td className={cn(tdCls, numCls)}>{total.perKg === null ? "—" : inr2(total.perKg)}</td>
                  <td className={cn(tdCls, numCls)}>{inr(total.freight)}</td>
                  <td className={cn(tdCls, numCls)}>{total.pod}</td>
                  <td className={cn(tdCls, numCls)}>{total.podMissing}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-xs text-ink-soft">
          <b>TAT</b> = actual dispatch (Actual ETD) → delivery (Actual ETA). <b>On time</b> = delivered on or before the planned ETA; <b>delayed</b> = after it, by the number of
          delay days shown. <b>Cost of delay</b>: Domestic MIS has no penalty field, so it shows the freight paid and the cargo (taxable) value on delayed shipments.{" "}
          <b>Rate</b> = Total Logistics Cost ÷ Quantity (kg). <b>POD</b> = a POD file uploaded in Domestic MIS.
        </p>
      </Card>
    </div>
  );
}
