"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { formatDmy, todayIso } from "@/lib/ops/dates";
import { deletePos, movePos, moveToMis, previewImport, returnFromMis, runImport, type ImportPreview } from "./actions";
import { boardCsv, csvFileName, statusText } from "./csv";
import { FIELD_PHASE, fieldLabel, queueStage, STAGES, TABLE_COLUMNS, TEAM_LABELS, TEAMS, type ColumnDef, type Phase, type Team } from "./fields";
import { canMoveToMis } from "./logic";
import { DocumentsModal, HistoryModal, Modal, ModalActions, PendingModal } from "./modals";
import { PoForm } from "./po-form";
import { LONG_HOLD_DAYS, slaBadge } from "./sla";
import type { BoardMasters, BoardViewer, PoRow } from "./types";

type Notice = { tone: "ok" | "error"; text: string } | null;

const PHASE_HEAD: Record<Phase, string> = {
  demand: "bg-amber-50/70",
  supply: "bg-blue-50/70",
  logistics: "bg-violet-50/70",
};

function sortValue(row: PoRow, key: string): number | string {
  if (key === "requestNo") return Number(row.requestNo) || 0;
  const col = TABLE_COLUMNS.find((c) => c.key === key);
  const v = row.values[key] ?? "";
  if (col?.num) return Number(v) || 0;
  return v.toLowerCase();
}

export function FreshPoBoard({
  board,
  rows,
  masters,
  viewer,
  autoMoved,
  showMoved,
  initialQuery,
}: {
  board: "FRESH" | "LONG_HOLD";
  rows: PoRow[];
  masters: BoardMasters;
  viewer: BoardViewer;
  autoMoved: number;
  showMoved: boolean;
  initialQuery: string;
}) {
  const isLongHold = board === "LONG_HOLD";
  const router = useRouter();
  const pathname = usePathname();
  const [team, setTeam] = useState<Team>(viewer.lockedTeam ?? viewer.defaultTeam);
  const [search, setSearch] = useState(initialQuery);
  const [myQueue, setMyQueue] = useState(false);
  const [hidden, setHidden] = useState<Set<Phase>>(new Set());
  const [sortKey, setSortKey] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<{ row: PoRow | null; key: number } | null>(null);
  const [pendingFor, setPendingFor] = useState<PoRow | null>(null);
  const [historyFor, setHistoryFor] = useState<PoRow | null>(null);
  const [docsFor, setDocsFor] = useState<PoRow | null>(null);
  const [importing, setImporting] = useState<Extract<ImportPreview, { ok: true }> | null>(null);
  const [notice, setNotice] = useState<Notice>(
    autoMoved > 0 ? { tone: "ok", text: `${autoMoved} PO${autoMoved > 1 ? "s" : ""} auto-moved to Long Hold PO (in Fresh PO over ${LONG_HOLD_DAYS} days).` } : null,
  );
  const [busy, start] = useTransition();
  const formRef = useRef<HTMLDivElement>(null);

  const today = todayIso();
  const visibleCols = useMemo(() => TABLE_COLUMNS.filter((c) => !c.sticky && !hidden.has(FIELD_PHASE[c.key])), [hidden]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const want = queueStage(team);
    let list = rows.filter((r) => {
      if (!isLongHold && myQueue && (r.board !== "FRESH" || r.stage !== want)) return false;
      if (!q) return true;
      return (
        r.requestNo.includes(q) ||
        TABLE_COLUMNS.some((c) => (c.type === "date" ? formatDmy(r.values[c.key]) : (r.values[c.key] ?? "")).toLowerCase().includes(q)) ||
        STAGES[r.stage].label.toLowerCase().includes(q) ||
        statusText(r).toLowerCase().includes(q)
      );
    });
    if (sortKey) {
      list = [...list].sort((a, b) => {
        const av = sortValue(a, sortKey);
        const bv = sortValue(b, sortKey);
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return list;
  }, [rows, search, myQueue, team, isLongHold, sortKey, sortDir]);

  // Ticks only refer to rows still on screen.
  const pickedRows = shown.filter((r) => picked.has(r.id));

  useEffect(() => {
    if (form) formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [form]);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function run(fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>, after?: () => void) {
    start(async () => {
      const res = await fn().catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
      setNotice(res.ok ? (res.message ? { tone: "ok", text: res.message } : null) : { tone: "error", text: res.error });
      if (res.ok) after?.();
    });
  }

  function sendToMis(r: PoRow) {
    if (!canMoveToMis(r.stage, r.values)) {
      setPendingFor(r);
      return;
    }
    run(() => moveToMis(r.id));
  }

  function backFromMis(r: PoRow) {
    if (!window.confirm(`Return PO #${r.requestNo} to Fresh PO?\n\nIts Domestic MIS job ${r.misJobNo ?? ""} moves to Archives, and the PO takes the next Fresh PO number.`)) return;
    run(() => returnFromMis(r.id));
  }

  function bulk(kind: "move" | "delete") {
    const list = kind === "delete" ? pickedRows : pickedRows.filter((r) => r.board === board);
    if (!list.length) {
      setNotice({ tone: "error", text: kind === "move" ? `None of the ticked POs are on the ${isLongHold ? "Long Hold" : "Fresh PO"} board.` : "Nothing ticked." });
      return;
    }
    const n = `${list.length} PO${list.length > 1 ? "s" : ""}`;
    const question =
      kind === "delete"
        ? `Delete ${n}?\n\nThey are kept in Archives for 3 days, so you can still recover them.`
        : isLongHold
          ? `Return ${n} to Fresh PO?`
          : `Move ${n} to Long Hold PO?`;
    if (!window.confirm(question)) return;
    const ids = list.map((r) => r.id);
    run(() => (kind === "delete" ? deletePos(ids) : movePos(ids, isLongHold ? "FRESH" : "LONG_HOLD")), () => setPicked(new Set()));
  }

  function removeOne(r: PoRow) {
    if (!window.confirm(`Delete PO #${r.requestNo}?\n\nIt is kept in Archives for 3 days, so you can still recover it.`)) return;
    run(() => deletePos([r.id]));
  }

  function exportCsv() {
    const blob = new Blob([boardCsv(shown)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFileName(today);
    a.click();
    URL.revokeObjectURL(url);
  }

  function pickSheet(file: File | undefined) {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    start(async () => {
      const res = await previewImport(fd);
      if (res.ok) setImporting(res);
      else setNotice({ tone: "error", text: res.error });
    });
  }

  function doImport() {
    if (!importing) return;
    const { rows: sheetRows, file } = importing;
    start(async () => {
      const res = await runImport(sheetRows, board, file);
      setImporting(null);
      if (!res.ok) {
        setNotice({ tone: "error", text: `Import failed: ${res.error}` });
        return;
      }
      setNotice({
        tone: "ok",
        text: `Imported: ${res.added} added, ${res.updated} updated, ${res.same} already here.${res.held ? ` ${res.held} of the new POs went to Long Hold PO — their PO date is over ${LONG_HOLD_DAYS} days ago.` : ""}`,
      });
    });
  }

  function setMoved(on: boolean) {
    const sp = new URLSearchParams();
    if (on) sp.set("moved", "1");
    if (search.trim()) sp.set("q", search.trim());
    router.replace(sp.size ? `${pathname}?${sp}` : pathname);
  }

  const openForm = (row: PoRow | null) => setForm({ row, key: Date.now() });
  const allTicked = shown.length > 0 && shown.every((r) => picked.has(r.id));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {viewer.lockedTeam ? (
          <span className="text-sm text-ink-soft" title="Your team is set on your user record">
            Your team <b className="text-ink">{TEAM_LABELS[viewer.lockedTeam]}</b>
          </span>
        ) : (
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            Acting as
            <Select value={team} onChange={(e) => setTeam(e.target.value as Team)} className="w-32">
              {TEAMS.map((t) => (
                <option key={t} value={t}>
                  {TEAM_LABELS[t]}
                </option>
              ))}
            </Select>
          </label>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {viewer.canEdit && (
            <label
              className="inline-flex h-9 cursor-pointer items-center rounded-md border border-line bg-surface px-3.5 text-sm font-medium text-ink shadow-sm hover:bg-muted"
              title="CSV or Excel with a header row. Rows matching a PO here (same customer, product and PO date) update it."
            >
              Import CSV / Excel
              <input
                type="file"
                hidden
                accept=".csv,.xlsx,.xls"
                disabled={busy}
                onChange={(e) => {
                  pickSheet(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
          )}
          {!isLongHold && viewer.canEdit && <Button onClick={() => openForm(null)}>+ New Entry</Button>}
        </div>
      </div>

      {notice && (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={cn(
            "mb-4 flex items-start justify-between gap-3 rounded-md border px-3 py-2 text-sm",
            notice.tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-800",
          )}
        >
          <span>{notice.text}</span>
          <button type="button" className="text-xs opacity-70 hover:opacity-100" onClick={() => setNotice(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      {form && (
        <div ref={formRef}>
          <PoForm
            key={form.key}
            row={form.row}
            team={team}
            viewer={viewer}
            masters={masters}
            onClose={() => setForm(null)}
            onSaved={(text) => {
              setForm(null);
              setNotice({ tone: "ok", text });
            }}
          />
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Input className="w-64" placeholder="Search entries or status…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {!isLongHold && (
          <label className="flex items-center gap-1.5 text-sm text-ink-soft">
            <input type="checkbox" checked={myQueue} onChange={(e) => setMyQueue(e.target.checked)} />
            My queue ({TEAM_LABELS[team]})
          </label>
        )}
        {!isLongHold && (
          <label className="flex items-center gap-1.5 text-sm text-ink-soft">
            <input type="checkbox" checked={showMoved} onChange={(e) => setMoved(e.target.checked)} />
            Show moved
          </label>
        )}
        <div className="flex items-center gap-1">
          {(["demand", "supply", "logistics"] as Phase[]).map((p) => (
            <button
              key={p}
              type="button"
              className={cn("rounded-full border px-2.5 py-1 text-xs capitalize", hidden.has(p) ? "border-line text-ink-faint line-through" : `border-line text-ink ${PHASE_HEAD[p]}`)}
              title={hidden.has(p) ? "Show these columns" : "Hide these columns"}
              onClick={() =>
                setHidden((s) => {
                  const n = new Set(s);
                  if (n.has(p)) n.delete(p);
                  else n.add(p);
                  return n;
                })
              }
            >
              {p}
            </button>
          ))}
        </div>
        <Button size="sm" variant="secondary" onClick={exportCsv} disabled={!shown.length}>
          Export CSV
        </Button>
        <span className="ml-auto text-xs text-ink-faint tabular-nums">{shown.length} entries</span>
      </div>

      {pickedRows.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-brand-100 bg-brand-50 px-3 py-2 text-sm">
          <b>{pickedRows.length} ticked</b>
          {viewer.canEdit && (
            <>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => bulk("move")}>
                {isLongHold ? "Return to Fresh PO" : "Move to Long Hold"}
              </Button>
              <Button size="sm" variant="danger" disabled={busy} onClick={() => bulk("delete")}>
                Delete
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPicked(new Set())}>
            Clear
          </Button>
          {busy && <span className="text-xs text-ink-soft">Working…</span>}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-sm">
        <table className="min-w-full text-xs">
          <thead className="bg-muted/60">
            <tr>
              <th className="sticky left-0 z-10 bg-muted px-3 py-2 text-left font-semibold whitespace-nowrap text-ink-soft">
                <input
                  type="checkbox"
                  className="mr-2 align-middle"
                  aria-label="Tick all shown"
                  checked={allTicked}
                  onChange={(e) => setPicked(e.target.checked ? new Set(shown.map((r) => r.id)) : new Set())}
                />
                <button type="button" onClick={() => toggleSort("requestNo")} className="font-semibold uppercase">
                  Request No.{sortKey === "requestNo" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                </button>
              </th>
              <th className="min-w-48 px-3 py-2 text-left font-semibold whitespace-nowrap text-ink-soft uppercase">Status / Operations</th>
              {visibleCols.map((c) => (
                <th
                  key={c.key}
                  style={{ minWidth: c.w }}
                  className={cn("px-3 py-2 font-semibold whitespace-nowrap text-ink-soft uppercase", c.num ? "text-right" : "text-left", PHASE_HEAD[FIELD_PHASE[c.key]])}
                >
                  <button type="button" onClick={() => toggleSort(c.key)} className="uppercase">
                    {c.label}
                    {sortKey === c.key ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                  </button>
                </th>
              ))}
              <th className="min-w-32 px-3 py-2 text-left font-semibold whitespace-nowrap text-ink-soft uppercase">PO File</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((r) => {
              const ready = canMoveToMis(r.stage, r.values);
              const badge = r.board === "FRESH" ? slaBadge({ poDate: r.values.poDate || null, holdReleasedAt: r.holdReleasedAt || null, createdAt: r.createdAt }, today) : null;
              return (
                <tr key={r.id} className={cn("group hover:bg-muted/40", r.board !== board && "opacity-70")}>
                  <td className="sticky left-0 z-10 bg-surface px-3 py-2 whitespace-nowrap group-hover:bg-muted">
                    <input
                      type="checkbox"
                      className="mr-2 align-middle"
                      aria-label={`Tick PO ${r.requestNo}`}
                      checked={picked.has(r.id)}
                      onChange={() =>
                        setPicked((s) => {
                          const n = new Set(s);
                          if (n.has(r.id)) n.delete(r.id);
                          else n.add(r.id);
                          return n;
                        })
                      }
                    />
                    <button type="button" className="font-medium text-brand-700 tabular-nums hover:underline" onClick={() => openForm(r)} title="Open to view / edit">
                      {r.requestNo || "—"}
                    </button>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <StatusCell
                      row={r}
                      ready={ready}
                      badge={badge}
                      canEdit={viewer.canEdit}
                      busy={busy}
                      onPending={() => setPendingFor(r)}
                      onMis={() => sendToMis(r)}
                      onBackFromMis={() => backFromMis(r)}
                      onBackFromHold={() => {
                        if (window.confirm(`Return PO #${r.requestNo} to Fresh PO?`)) run(() => movePos([r.id], "FRESH"));
                      }}
                    />
                  </td>
                  {visibleCols.map((c) => (
                    <Cell key={c.key} col={c} value={r.values[c.key] ?? ""} />
                  ))}
                  <td className="max-w-40 px-3 py-2">
                    {r.poFile ? (
                      <a className="block truncate text-brand-700 hover:underline" href={r.poFile.url} target="_blank" rel="noreferrer" title={r.poFile.name}>
                        {r.poFile.name}
                      </a>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <RowMenu
                      items={[
                        { label: "Documents", onClick: () => setDocsFor(r) },
                        { label: "History", onClick: () => setHistoryFor(r) },
                        ...(viewer.canEdit ? [{ label: "Delete", onClick: () => removeOne(r), danger: true }] : []),
                      ]}
                    />
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={visibleCols.length + 4} className="px-4 py-10 text-center text-sm text-ink-faint">
                  {isLongHold ? `No POs on long hold — everything is within the ${LONG_HOLD_DAYS}-day window.` : "No entries match — adjust the filters or add a new entry."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pendingFor && (
        <PendingModal
          row={pendingFor}
          onClose={() => setPendingFor(null)}
          onOpen={() => {
            const r = pendingFor;
            setPendingFor(null);
            openForm(r);
          }}
        />
      )}
      {historyFor && <HistoryModal row={historyFor} onClose={() => setHistoryFor(null)} />}
      {docsFor && <DocumentsModal row={docsFor} canEdit={viewer.canEdit} onClose={() => setDocsFor(null)} />}
      {importing && (
        <Modal title={`Import ${importing.file}`} onClose={() => setImporting(null)} wide>
          <p className="text-sm text-ink-soft">
            <b className="text-ink">{importing.rows.length}</b> rows found on “{importing.sheet}”: <b className="text-ink">{importing.rows.length - importing.existing}</b> new{" "}
            {isLongHold ? "Long Hold POs" : "Fresh POs"}, <b className="text-ink">{importing.existing}</b> already here (same customer, product and PO date) — those aren’t added again;
            only their changed details are updated, and blank cells change nothing. New POs get the next Request No.; the sheet’s numbers aren’t used.
          </p>
          {importing.truncated && <p className="mt-2 text-sm text-amber-700">Only the first 2000 rows are imported.</p>}
          <p className="mt-2 text-xs text-ink-soft">Columns used: {importing.columns.map((c) => `${c.header} → ${fieldLabel(c.key)}`).join(" · ")}</p>
          {importing.skipped.length > 0 && <p className="mt-1 text-xs text-ink-faint">Not used: {importing.skipped.join(", ")}</p>}
          {!isLongHold && <p className="mt-1 text-xs text-ink-faint">POs with a PO date over {LONG_HOLD_DAYS} days ago go straight to Long Hold PO.</p>}
          <ModalActions>
            <Button variant="secondary" onClick={() => setImporting(null)}>
              Cancel
            </Button>
            <Button onClick={doImport} disabled={!importing.rows.length || busy}>
              {busy ? "Importing…" : `Import ${importing.rows.length} rows`}
            </Button>
          </ModalActions>
        </Modal>
      )}
    </div>
  );
}

function StatusCell({
  row,
  ready,
  badge,
  canEdit,
  busy,
  onPending,
  onMis,
  onBackFromMis,
  onBackFromHold,
}: {
  row: PoRow;
  ready: boolean;
  badge: string | null;
  canEdit: boolean;
  busy: boolean;
  onPending: () => void;
  onMis: () => void;
  onBackFromMis: () => void;
  onBackFromHold: () => void;
}) {
  const stage = STAGES[row.stage];
  if (row.board === "MIS") {
    return (
      <div className="flex items-center gap-2">
        <Badge tone="green">In Operations → Job {row.misJobNo ?? "—"}</Badge>
        {canEdit && (
          <button type="button" className="text-xs text-brand-700 hover:underline" disabled={busy} onClick={onBackFromMis}>
            Return to Fresh PO
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {row.board === "LONG_HOLD" && <Badge tone="gray">Long Hold</Badge>}
      <button type="button" onClick={ready ? undefined : onPending} title={ready ? undefined : "See pending details"} className={cn(!ready && "cursor-pointer")}>
        <Badge tone={stage.tone}>
          {stage.label}
          {ready ? "" : " ⚑"}
        </Badge>
      </button>
      {badge && (
        <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-700 tabular-nums" title={`Approaching the ${LONG_HOLD_DAYS}-day long-hold limit`}>
          {badge}
        </span>
      )}
      {canEdit && row.board === "FRESH" && ready && (
        <Button size="sm" className="h-7" disabled={busy} onClick={onMis}>
          → Domestic MIS
        </Button>
      )}
      {canEdit && row.board === "LONG_HOLD" && (
        <button type="button" className="text-xs text-brand-700 hover:underline" disabled={busy} onClick={onBackFromHold}>
          Return to Fresh PO
        </button>
      )}
    </div>
  );
}

function Cell({ col, value }: { col: ColumnDef; value: string }) {
  if (col.type === "yesno" && value) {
    return (
      <td className="px-3 py-2">
        <Badge tone={value.toLowerCase() === "yes" ? "green" : "gray"}>{value}</Badge>
      </td>
    );
  }
  const display = col.num ? (value ? formatNumber(value, 2) : "") : col.type === "date" ? formatDmy(value) : value.replace(/\s*\n\s*/g, " · ");
  return (
    <td className={cn("px-3 py-2", col.num && "text-right tabular-nums")} title={value.length > 40 ? value : undefined}>
      <div className="line-clamp-2" style={{ maxWidth: Math.max(col.w, 120) * 1.4 }}>
        {display}
      </div>
    </td>
  );
}

/** Row menu, positioned fixed so the scroll area doesn't clip it. */
function RowMenu({ items }: { items: Array<{ label: string; onClick: () => void; danger?: boolean }> }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pos]);
  return (
    <>
      <button
        ref={btn}
        type="button"
        className="rounded px-2 py-1 text-base leading-none text-ink-soft hover:bg-muted hover:text-ink"
        aria-label="More actions"
        onClick={() => {
          if (pos) return setPos(null);
          const r = btn.current!.getBoundingClientRect();
          setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.right - 160, window.innerWidth - 170)) });
        }}
      >
        ⋮
      </button>
      {pos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPos(null)} />
          <div className="fixed z-50 w-40 rounded-md border border-line bg-surface py-1 shadow-lg" style={{ top: pos.top, left: pos.left }}>
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                className={cn("block w-full px-3 py-1.5 text-left text-sm hover:bg-muted", it.danger ? "text-red-600" : "text-ink")}
                onClick={() => {
                  setPos(null);
                  it.onClick();
                }}
              >
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
