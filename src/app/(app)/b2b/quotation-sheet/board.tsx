"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { TX_SLOTS, VEHICLE_STATUS, VEHICLE_TYPES, matchesSearch, toggleStage, type Bid } from "./_lib/board";
import { approveQuote, saveQuote, type QuotePatch } from "./actions";

export type BoardRow = {
  id: string;
  misJobId: string;
  jobNo: string;
  distance: string;
  supplier: string;
  pickupAddress: string;
  customer: string;
  deliveryAddress: string;
  netWeight: string;
  grossWt: string;
  packing: string;
  taxableValue: string;
  paymentTerms: string;
  agDemandPoc: string;
  materialReadiness: string;
  materialReadyTime: string;
  vehicleStatus: string;
  vehicleStages: string[];
  vehicleArrangements: string;
  vehicleDetails: string;
  vehicleType: string;
  approvedTx: string;
  bids: Bid[];
};

const SAVE_DELAY_MS = 600;
const inr = (v: string) => {
  const n = Number(v.replace(/[^0-9.]/g, ""));
  return n ? formatNumber(n, 2) : v;
};
const cellIn =
  "w-full min-w-12 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-[11px] text-ink hover:border-line focus:border-brand-500 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:hover:border-transparent";

/** The D-0 grid: read-only MIS columns, editable readiness / quotes / vehicle progress, autosaved. */
export function QuotationBoard({ rows: initial, transporters, canEdit, today }: { rows: BoardRow[]; transporters: string[]; canEdit: boolean; today: string }) {
  const [rows, setRows] = useState(initial);
  const [search, setSearch] = useState("");
  const [banner, setBanner] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pending = useRef<Record<string, QuotePatch | null>>({});

  const shown = useMemo(() => rows.filter((r) => matchesSearch(r, search)), [rows, search]);

  async function flush(id: string) {
    clearTimeout(timers.current[id]);
    const body = pending.current[id];
    pending.current[id] = null;
    if (!body) return true;
    setSaving((s) => ({ ...s, [id]: true }));
    let ok = false,
      why = "";
    try {
      const r = await saveQuote(id, body);
      ok = r.ok;
      if (!r.ok) why = r.error;
    } catch (e) {
      why = e instanceof Error ? e.message : String(e);
    }
    setSaving((s) => ({ ...s, [id]: false }));
    if (!ok) {
      // Put the unsaved change back in the queue and say so.
      pending.current[id] = { ...body, ...(pending.current[id] ?? {}) };
      setBanner(`A change wasn't saved${why ? ` (${why})` : ""}. Edit the cell again to retry.`);
    }
    return ok;
  }

  function patchRow(id: string, patch: Partial<BoardRow>, save: QuotePatch = patch as QuotePatch) {
    setRows((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    if (!canEdit) return;
    pending.current[id] = { ...(pending.current[id] ?? {}), ...save };
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => void flush(id), SAVE_DELAY_MS);
  }

  function patchBid(row: BoardRow, i: number, key: keyof Bid, value: string) {
    const bids = row.bids.map((b, j) => (j === i ? { ...b, [key]: value } : b));
    patchRow(row.id, { bids });
  }

  async function approve(row: BoardRow, slot: string) {
    const on = row.approvedTx !== slot;
    setRows((list) => list.map((r) => (r.id === row.id ? { ...r, approvedTx: on ? slot : "" } : r)));
    if (!(await flush(row.id))) return;
    try {
      let r = await approveQuote(row.id, on ? slot : "");
      if (!r.ok && "confirm" in r) {
        if (!window.confirm(r.confirm)) {
          setNote(`Approved ${slot}. Domestic MIS left as it was.`);
          return;
        }
        r = await approveQuote(row.id, slot, true);
      }
      if (r.ok) setNote(r.note);
      else setBanner("error" in r ? r.error : "Couldn't approve.");
    } catch (e) {
      setBanner(`Approved, but Domestic MIS job ${row.jobNo} couldn't be updated (${e instanceof Error ? e.message : String(e)}). Enter the transporter there.`);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
          {rows.length} dispatching today (D-0 · {today})
        </span>
        <input
          className="h-9 w-72 max-w-full rounded-md border border-line bg-surface px-3 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          placeholder="Search job / customer / supplier / transporter…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search"
        />
        <span className="text-xs text-ink-soft">{shown.length} shipments</span>
        {!canEdit && <span className="text-xs text-ink-faint">View only</span>}
      </div>
      {banner && (
        <p role="alert" className="cursor-pointer rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" onClick={() => setBanner("")} title="Click to dismiss">
          {banner}
        </p>
      )}
      {note && (
        <p role="status" className="cursor-pointer rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700" onClick={() => setNote("")} title="Click to dismiss">
          {note}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-sm">
        <table className="min-w-full border-collapse text-[11.5px] [&_td]:border-b [&_td]:border-line [&_td]:px-1 [&_td]:py-0.5 [&_td]:align-top [&_th]:border-b [&_th]:border-line [&_th]:bg-muted [&_th]:px-1.5 [&_th]:py-2 [&_th]:text-left [&_th]:text-[10.5px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-ink-soft [&_th]:whitespace-nowrap">
          <thead>
            <tr>
              <th className="sticky left-0 z-10">Job No</th>
              <th className="min-w-16">Distance</th>
              <th className="min-w-44">Supplier</th>
              <th className="min-w-44">Customer</th>
              <th className="min-w-16">Net Wt</th>
              <th className="min-w-16">Gross Wt</th>
              <th className="min-w-20">Packaging</th>
              <th className="min-w-24">Taxable</th>
              <th className="min-w-24">Payment</th>
              <th className="min-w-20">Demand POC</th>
              <th className="min-w-32">Material ready</th>
              {TX_SLOTS.map((s) => (
                <th key={s} className="min-w-36">
                  {s}
                </th>
              ))}
              <th className="min-w-44">Vehicle status</th>
              <th className="min-w-28">Veh. arrangement</th>
              <th className="min-w-28">Veh. details</th>
              <th className="min-w-28">Veh. type</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={TX_SLOTS.length + 15} className="px-4 py-10 text-center text-sm text-ink-faint">
                  {rows.length
                    ? "No shipments match the search."
                    : "No shipments dispatching today. Jobs whose Actual / Tentative ETD in Domestic MIS is today appear here automatically."}
                </td>
              </tr>
            ) : (
              shown.map((e) => (
                <tr key={e.id}>
                  <td className="sticky left-0 z-[1] bg-muted">
                    <Link href={`/b2b/mis?edit=${encodeURIComponent(e.misJobId)}`} className="block px-1.5 py-0.5 font-semibold text-brand-700 hover:underline">
                      {e.jobNo || "—"}
                    </Link>
                    {saving[e.id] && <span className="block px-1.5 text-[9px] italic text-ink-faint">saving…</span>}
                  </td>
                  <Ro v={e.distance} />
                  <Ro v={e.supplier} sub={e.pickupAddress} />
                  <Ro v={e.customer} sub={e.deliveryAddress} />
                  <Ro v={e.netWeight} />
                  <Ro v={e.grossWt} />
                  <Ro v={e.packing} />
                  <Ro v={e.taxableValue ? inr(e.taxableValue) : ""} />
                  <Ro v={e.paymentTerms} />
                  <Ro v={e.agDemandPoc} />
                  <td>
                    <select
                      className={cn(cellIn, "cursor-pointer")}
                      value={e.materialReadiness}
                      disabled={!canEdit}
                      aria-label="Material ready"
                      onChange={(ev) =>
                        patchRow(e.id, { materialReadiness: ev.target.value, ...(ev.target.value !== "Yes" ? { materialReadyTime: "" } : {}) })
                      }
                    >
                      <option value="">—</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </select>
                    {e.materialReadiness === "Yes" && (
                      <input
                        className={cellIn}
                        placeholder="timings…"
                        value={e.materialReadyTime}
                        disabled={!canEdit}
                        aria-label="Material ready timings"
                        onChange={(ev) => patchRow(e.id, { materialReadyTime: ev.target.value })}
                      />
                    )}
                    {e.materialReadiness === "No" && <span className="block px-1.5 text-[9.5px] text-ink-faint">no actions needed</span>}
                  </td>
                  {e.bids.map((b, i) => {
                    const slot = TX_SLOTS[i];
                    const approved = e.approvedTx === slot;
                    return (
                      <td key={slot} className={cn(approved && "bg-emerald-50 shadow-[inset_0_0_0_2px_var(--color-emerald-500)]")}>
                        <input
                          className={cellIn}
                          list="qs-transporters"
                          placeholder="transporter"
                          value={b.name}
                          disabled={!canEdit}
                          aria-label={`${slot} transporter`}
                          onChange={(ev) => patchBid(e, i, "name", ev.target.value)}
                        />
                        <div className="flex gap-0.5">
                          <input
                            className={cellIn}
                            placeholder="₹ quote"
                            value={b.quote}
                            disabled={!canEdit}
                            aria-label={`${slot} quote`}
                            onChange={(ev) => patchBid(e, i, "quote", ev.target.value)}
                          />
                          <input
                            className={cellIn}
                            placeholder="TAT"
                            value={b.tat}
                            disabled={!canEdit}
                            aria-label={`${slot} TAT`}
                            onChange={(ev) => patchBid(e, i, "tat", ev.target.value)}
                          />
                        </div>
                        <input
                          className={cellIn}
                          placeholder="remarks"
                          value={b.remarks}
                          disabled={!canEdit}
                          aria-label={`${slot} remarks`}
                          onChange={(ev) => patchBid(e, i, "remarks", ev.target.value)}
                        />
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => void approve(e, slot)}
                          className={cn(
                            "mt-0.5 w-full rounded-md border px-1.5 py-0.5 text-[10px] font-bold disabled:opacity-60",
                            approved ? "border-emerald-600 bg-emerald-600 text-white" : "border-line bg-surface text-ink-soft hover:border-emerald-600 hover:text-emerald-700",
                          )}
                        >
                          {approved ? "✓ Approved" : "Approve"}
                        </button>
                      </td>
                    );
                  })}
                  <td>
                    <div className="flex flex-col">
                      {VEHICLE_STATUS.map((s, i) => {
                        const done = e.vehicleStages.includes(s);
                        return (
                          <button
                            key={s}
                            type="button"
                            disabled={!canEdit}
                            onClick={() => patchRow(e.id, toggleStage(e.vehicleStages, i))}
                            title={done ? "Done — click to undo from here" : "Mark done up to this step"}
                            className={cn(
                              "flex w-full items-center gap-1 rounded px-1 py-px text-left text-[9.5px] font-semibold leading-tight hover:bg-muted disabled:hover:bg-transparent",
                              done ? "text-emerald-700" : "text-ink-soft",
                            )}
                          >
                            <span
                              className={cn(
                                "inline-flex size-3 flex-none items-center justify-center rounded-full text-[7.5px] font-bold",
                                done ? "bg-emerald-600 text-white" : "bg-line text-ink-faint",
                              )}
                            >
                              {done ? "✓" : "○"}
                            </span>
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td>
                    <input
                      className={cellIn}
                      value={e.vehicleArrangements}
                      disabled={!canEdit}
                      aria-label="Vehicle arrangement"
                      onChange={(ev) => patchRow(e.id, { vehicleArrangements: ev.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className={cellIn}
                      value={e.vehicleDetails}
                      disabled={!canEdit}
                      aria-label="Vehicle details"
                      onChange={(ev) => patchRow(e.id, { vehicleDetails: ev.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      className={cn(cellIn, "cursor-pointer")}
                      value={(VEHICLE_TYPES as readonly string[]).includes(e.vehicleType) ? e.vehicleType : ""}
                      disabled={!canEdit}
                      aria-label="Vehicle type"
                      onChange={(ev) => patchRow(e.id, { vehicleType: ev.target.value })}
                    >
                      <option value="">— type —</option>
                      {VEHICLE_TYPES.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                    {e.vehicleType && !(VEHICLE_TYPES as readonly string[]).includes(e.vehicleType) && (
                      <span className="block px-1.5 text-[9.5px] text-ink-faint" title="From Domestic MIS">
                        MIS: {e.vehicleType}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <datalist id="qs-transporters">
        {transporters.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
    </div>
  );
}

/** Read-only cell (filled from Domestic MIS), with an optional address line under it. */
function Ro({ v, sub }: { v: string; sub?: string }) {
  return (
    <td className="bg-muted/60">
      <div className="max-w-40 truncate px-1.5 py-0.5 text-[11px] text-ink" title={v}>
        {v || "—"}
      </div>
      {sub && (
        <div className="max-w-44 px-1.5 pb-0.5 text-[9.5px] leading-snug whitespace-normal text-ink-soft" title={sub}>
          {sub}
        </div>
      )}
    </td>
  );
}
