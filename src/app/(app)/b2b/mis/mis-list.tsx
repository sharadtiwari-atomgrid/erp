"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button, ButtonLink, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { formatDmy } from "@/lib/ops/dates";
import { ShipmentJourney } from "../_shared/journey";
import type { JourneyJob } from "../_shared/journey-data";
import { matchesSearch, PAGE_STEP } from "./_lib/list";
import { deleteMisJob, getMisJourney, importMisSheet, markMisStatus, moveMisJobBackToFreshPo, type ImportState } from "./actions";
import type { ListRow } from "./_server/data";
import { MisStatusPill } from "./status-pill";

export function MisList({ rows, canEdit, initialQ, notFound }: { rows: ListRow[]; canEdit: boolean; initialQ: string; notFound: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ);
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [limit, setLimit] = useState(PAGE_STEP);
  const [banner, setBanner] = useState(notFound ? `No live job matches “${notFound}”. It may have been deleted.` : "");
  const [journey, setJourney] = useState<JourneyJob | null>(null);
  const [pending, start] = useTransition();

  const flagged = useMemo(() => rows.filter((r) => r.issues > 0).length, [rows]);
  const listed = useMemo(() => rows.filter((r) => (!onlyIssues || r.issues > 0) && matchesSearch(r, q)), [rows, onlyIssues, q]);
  const shown = listed.slice(0, limit);
  const exportHref = `/b2b/mis/export?${new URLSearchParams({ ...(q.trim() ? { q: q.trim() } : {}), ...(onlyIssues ? { attn: "1" } : {}) })}`;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done?: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) setBanner(`⚠ ${r.error}`);
      else {
        if (done) setBanner(done);
        router.refresh();
      }
    });

  const jobLabel = (r: ListRow) => (r.jobNo ? `Job No. ${r.jobNo}` : "this entry");

  function mark(r: ListRow, status: "INTRANSIT" | "DELIVERED") {
    start(async () => {
      const res = await markMisStatus(r.id, status);
      if (res.ok) router.refresh();
      // Open the entry with the new status and say what's missing.
      else if (res.problems?.length) router.push(`/b2b/mis?edit=${encodeURIComponent(r.id)}&to=${status}`);
      else setBanner(`⚠ ${res.error}`);
    });
  }

  function openJourney(r: ListRow) {
    start(async () => {
      const j = await getMisJourney(r.id);
      if (j) setJourney(j);
      else setBanner("⚠ That job is no longer there.");
    });
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setLimit(PAGE_STEP);
          }}
          placeholder="Search job, customer, product, supplier, batch, transporter, status, POC…"
          className="max-w-md flex-1"
          aria-label="Search shipments"
        />
        {flagged > 0 && (
          <button
            type="button"
            onClick={() => {
              setOnlyIssues(!onlyIssues);
              setLimit(PAGE_STEP);
            }}
            className={cn(
              "h-9 rounded-full border px-3 text-sm font-medium",
              onlyIssues ? "border-amber-500 bg-amber-50 text-amber-800" : "border-line bg-surface text-ink-soft hover:text-ink",
            )}
            aria-pressed={onlyIssues}
            title="A name not in the masters, a missing date or POD, or dates that don't add up"
          >
            ⚠ Needs attention ({flagged})
          </button>
        )}
        <span className="flex-1" />
        <a href={exportHref} className={buttonClass("secondary")}>
          ⬇ Excel ({listed.length})
        </a>
        {canEdit && (
          <>
            <ImportButton onDone={(msg) => setBanner(msg)} />
            <ButtonLink href="/b2b/mis?edit=new&paste=1" variant="secondary">
              Paste from email
            </ButtonLink>
            <ButtonLink href="/b2b/mis?edit=new">New entry</ButtonLink>
          </>
        )}
      </div>

      {banner && (
        <div
          role="status"
          className={cn(
            "mb-3 flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm",
            banner.startsWith("⚠") ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700",
          )}
        >
          <span>{banner}</span>
          <button type="button" className="text-xs opacity-70 hover:opacity-100" onClick={() => setBanner("")} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      <Card className={cn(pending && "opacity-70 transition-opacity")}>
        <div className="max-h-[calc(100vh-240px)] overflow-auto">
          <table className="min-w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                {["Job No.", "PO Date", "Customer", "Product Name", "Quantity (kg)", "Status", "Planned ETD", "Planned ETA", ""].map((h, i) => (
                  <th
                    key={h || i}
                    scope="col"
                    className={cn(
                      "sticky top-0 z-10 border-b border-line bg-muted px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap text-ink-soft",
                      i === 0 && "left-0 z-20",
                      i === 4 && "text-right",
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-ink-faint">
                    {rows.length === 0
                      ? "No shipments yet. Add one with New entry, import the MIS sheet, or move a PO in from Fresh PO."
                      : "Nothing matches. Try part of a job number, customer, product, batch or transporter."}
                  </td>
                </tr>
              )}
              {shown.map((r) => (
                <tr key={r.id} className="group">
                  <td className="sticky left-0 z-[1] border-b border-line bg-surface px-3 py-2 whitespace-nowrap group-hover:bg-muted">
                    <Link href={`/b2b/mis?edit=${encodeURIComponent(r.id)}`} className="font-semibold text-brand-700 tabular-nums hover:underline">
                      {r.jobNo || "(no job no.)"}
                    </Link>
                    {r.source === "fresh-po" && (
                      <span
                        className="ml-1.5 rounded-full bg-brand-50 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700"
                        title={r.requestNo ? `From Fresh PO #${r.requestNo}` : "From Fresh PO"}
                      >
                        from PO
                      </span>
                    )}
                    {r.issues > 0 && (
                      <span className="ml-1.5 text-xs text-amber-600" title={`${r.issues} thing${r.issues === 1 ? "" : "s"} to check`}>
                        ⚠ {r.issues}
                      </span>
                    )}
                  </td>
                  <Cell>{r.poDate ? formatDmy(r.poDate) : "—"}</Cell>
                  <Cell className="max-w-[260px] truncate" title={r.customer}>
                    {r.customer || "—"}
                  </Cell>
                  <Cell className="max-w-[260px] truncate" title={r.productName}>
                    {r.productName || "—"}
                  </Cell>
                  <Cell className="text-right tabular-nums">{r.quantityKgs ? Number(r.quantityKgs).toLocaleString("en-IN") : "—"}</Cell>
                  <Cell>
                    <MisStatusPill status={r.status} />
                  </Cell>
                  <Cell className="tabular-nums">{r.plannedEtd ? formatDmy(r.plannedEtd) : "—"}</Cell>
                  <Cell className="tabular-nums">{r.plannedEta ? formatDmy(r.plannedEta) : "—"}</Cell>
                  <Cell className="text-right">
                    <RowMenu
                      items={[
                        { label: "View journey", onClick: () => openJourney(r) },
                        { label: "Open details", href: `/b2b/mis?edit=${encodeURIComponent(r.id)}` },
                        ...(canEdit
                          ? [
                              { sep: true as const },
                              {
                                label: r.status === "INTRANSIT" ? "✓ Marked In transit" : "Mark In transit",
                                disabled: r.status === "INTRANSIT" || r.status === "DELIVERED",
                                onClick: () => mark(r, "INTRANSIT"),
                              },
                              {
                                label: r.status === "DELIVERED" ? "✓ Marked Delivered" : "Mark Delivered",
                                disabled: r.status === "DELIVERED",
                                onClick: () => mark(r, "DELIVERED"),
                              },
                              ...(r.source === "fresh-po"
                                ? [
                                    {
                                      label: "Move back to Fresh PO",
                                      onClick: () => {
                                        if (!window.confirm(`Move ${jobLabel(r)} back to Fresh PO?\n\nIt is removed from Domestic MIS and reappears on the Fresh PO board.`)) return;
                                        run(() => moveMisJobBackToFreshPo(r.id), `↩ ${jobLabel(r)} moved back to Fresh PO.`);
                                      },
                                    },
                                  ]
                                : []),
                              { sep: true as const },
                              {
                                label: "Delete",
                                danger: true,
                                onClick: () => {
                                  if (!window.confirm(`Delete ${jobLabel(r)}?\n\nIt is kept in Archives, so it can still be recovered.`)) return;
                                  run(() => deleteMisJob(r.id), `🗑 ${jobLabel(r)} deleted. It can be recovered from Archives.`);
                                },
                              },
                            ]
                          : []),
                      ]}
                    />
                  </Cell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-xs text-ink-soft">
          <span>
            Showing {shown.length.toLocaleString("en-IN")} of {listed.length.toLocaleString("en-IN")}
            {listed.length !== rows.length && ` (${rows.length.toLocaleString("en-IN")} in all)`}
          </span>
          {listed.length > shown.length && (
            <Button variant="secondary" size="sm" onClick={() => setLimit((n) => n + PAGE_STEP)}>
              Show {Math.min(PAGE_STEP, listed.length - shown.length)} more
            </Button>
          )}
        </div>
      </Card>

      {journey && <JourneyModal job={journey} onClose={() => setJourney(null)} />}
    </>
  );
}

function Cell({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("border-b border-line px-3 py-2 whitespace-nowrap text-ink group-hover:bg-muted/60", className)} {...props} />;
}

type MenuItem = { sep: true } | { label: string; onClick?: () => void; href?: string; disabled?: boolean; danger?: boolean; sep?: false };

/** Per-row ⋮ menu. */
function RowMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label="Actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-grid size-8 place-items-center rounded-md text-lg leading-none text-ink-soft hover:bg-muted hover:text-ink"
        onClick={(e) => {
          e.stopPropagation();
          const r = btn.current!.getBoundingClientRect();
          setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 200) });
          setOpen((o) => !o);
        }}
      >
        ⋮
      </button>
      {open && (
        <div
          role="menu"
          className="fixed z-50 w-[200px] rounded-lg border border-line bg-surface p-1 text-left shadow-lg"
          style={{ top: pos.top, left: pos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((it, i) =>
            it.sep ? (
              <div key={i} className="mx-1.5 my-1 h-px bg-line" />
            ) : it.href ? (
              <Link key={i} role="menuitem" href={it.href} className="block rounded-md px-3 py-2 text-sm font-medium text-ink hover:bg-muted">
                {it.label}
              </Link>
            ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onClick?.();
                }}
                className={cn(
                  "block w-full rounded-md px-3 py-2 text-left text-sm font-medium disabled:cursor-default disabled:text-ink-faint",
                  it.danger ? "text-red-600 hover:bg-red-50" : "text-ink hover:bg-muted",
                )}
              >
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </>
  );
}

function JourneyModal({ job, onClose }: { job: JourneyJob; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Shipment journey" className="w-full max-w-5xl rounded-lg bg-canvas p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Shipment journey</h2>
          <button type="button" onClick={onClose} className="text-ink-soft hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>
        <ShipmentJourney job={job} />
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <ButtonLink href={`/b2b/mis?edit=${encodeURIComponent(job.id)}`}>Open details</ButtonLink>
        </div>
      </div>
    </div>
  );
}

/** "Import sheet": CSV / XLSX upload, upsert by Job No. */
function ImportButton({ onDone }: { onDone: (msg: string) => void }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<ImportState, FormData>(importMisSheet, undefined);
  const last = useRef<ImportState>(undefined);
  useEffect(() => {
    if (!state || state === last.current) return;
    last.current = state;
    onDone(state.error ? `⚠ ${state.error}` : `✓ ${state.success}`);
    router.refresh();
  }, [state, onDone, router]);
  return (
    <form ref={form} action={action}>
      <label
        className={buttonClass("secondary", "md", pending ? "pointer-events-none opacity-60" : "cursor-pointer")}
        title="The Domestic MIS sheet (CSV or Excel). Rows are matched by Job No.: existing jobs get the sheet's non-blank cells, new Job Nos. are added."
      >
        {pending ? "Importing…" : "⬆ Import sheet"}
        <input
          type="file"
          name="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          hidden
          onChange={(e) => {
            if (e.target.files?.length) form.current?.requestSubmit();
          }}
        />
      </label>
    </form>
  );
}
