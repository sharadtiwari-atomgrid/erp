"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatDmy } from "@/lib/ops/dates";
import type { SheetIssue } from "@/lib/batch-inventory";
import { loadHistory, type HistoryLine } from "../_lib/history";
import type { ImportResult, Preview } from "../_lib/types";

/** kg / numbers: en-IN, up to 3 decimals, "" for blank. */
export const kg = (v: number | null | undefined) =>
  v === null || v === undefined || Number.isNaN(v) ? "" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: 3 });
export const inr = (v: number | null | undefined) => (v === null || v === undefined ? "—" : "₹" + Math.round(v).toLocaleString("en-IN"));

/** Dense sheet-like table wrapper: horizontal + vertical scroll, sticky header. */
export const sheetTable = "min-w-full border-separate border-spacing-0 text-xs";
export const th = "sticky top-0 z-10 whitespace-nowrap border-b border-line bg-muted px-2 py-2 text-left font-semibold uppercase tracking-wide text-ink-soft";
export const td = "whitespace-nowrap border-b border-line px-2 py-1.5 text-ink";
export const stickyCol = "sticky left-0 z-[5] bg-surface";
export const inputCls =
  "block w-full rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

export function Tile({ label, value, hint, tone = "default", onClick, active }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "warning" | "danger"; onClick?: () => void; active?: boolean }) {
  const body = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</p>
      <p className={cn("mt-1.5 text-2xl font-semibold tabular-nums", tone === "warning" ? "text-amber-600" : tone === "danger" ? "text-red-600" : "text-ink")}>{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-soft">{hint}</p>}
    </>
  );
  const cls = cn("rounded-lg border border-line bg-surface px-4 py-3 text-left shadow-sm", active && "ring-2 ring-brand-500/40");
  return onClick ? (
    <button type="button" className={cn(cls, "hover:bg-muted/40")} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Modal({ title, onClose, children, footer, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 print:hidden" onClick={onClose}>
      <div className={cn("my-8 w-full rounded-lg border border-line bg-surface shadow-xl", wide ? "max-w-6xl" : "max-w-xl")} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <button type="button" className="text-ink-faint hover:text-ink" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Issues({ issues }: { issues: SheetIssue[] }) {
  if (!issues.length) return null;
  return (
    <details className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <summary className="cursor-pointer font-medium">
        {issues.length} line{issues.length > 1 ? "s" : ""} to look at
      </summary>
      <ul className="mt-2 max-h-60 list-disc space-y-0.5 overflow-y-auto pl-5">
        {issues.map((x, i) => (
          <li key={i}>
            Row {x.row}: {x.msg}
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Sheet import: the file is read on the server (preview), the issues are shown, then the
 * entries are added ("add": skip lines already there) or replace the current ones (Admins).
 */
export function ImportDialog<E>({
  title,
  hint,
  isAdmin,
  hasRows,
  replaceLabel,
  allowReplace = true,
  preview,
  commit,
  onClose,
}: {
  title: string;
  hint: ReactNode;
  isAdmin: boolean;
  hasRows: boolean;
  replaceLabel?: string;
  allowReplace?: boolean;
  preview: (fd: FormData) => Promise<Preview<E>>;
  commit: (input: { mode: "add" | "replace"; fileName: string; entries: E[] }) => Promise<ImportResult>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [read, setRead] = useState<Extract<Preview<E>, { ok: true }> | null>(null);
  const [mode, setMode] = useState<"add" | "replace">("add");
  const [msg, setMsg] = useState("");
  const [busy, start] = useTransition();

  const pick = (file: File) =>
    start(async () => {
      setRead(null);
      setMsg("Reading…");
      const fd = new FormData();
      fd.set("file", file);
      const r = await preview(fd);
      if (r.ok) {
        setRead(r);
        setMsg("");
      } else setMsg(r.error);
    });
  const go = () =>
    start(async () => {
      if (!read) return;
      if (mode === "replace" && hasRows && !window.confirm(`${replaceLabel ?? "Replace the current lines with this sheet?"}\n\nThe current lines are set aside (soft-deleted) and the sheet's lines go in.`)) return;
      setMsg("Saving…");
      const r = await commit({ mode, fileName: read.fileName, entries: read.entries });
      if (!r.ok) {
        setMsg("Not imported: " + r.error);
        return;
      }
      setMsg(`${r.added} lines added${r.skipped ? `, ${r.skipped} already there` : ""}${r.removed ? `, ${r.removed} earlier lines set aside` : ""}.`);
      router.refresh();
      setTimeout(onClose, 1200);
    });

  return (
    <Modal
      title={title}
      onClose={() => !busy && onClose()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={go} disabled={!read || busy || (mode === "replace" && !isAdmin)}>
            {mode === "replace" ? "Replace with" : "Add"} {read ? read.entries.length : ""} lines
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-soft">{hint}</p>
      <input
        type="file"
        accept=".csv,.xlsx,.xls"
        disabled={busy}
        className="mt-3 block text-sm"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) pick(f);
        }}
      />
      {read && (
        <div className="mt-3 space-y-1.5 text-sm">
          <p>
            <b>{read.entries.length}</b> lines read from {read.fileName}.
          </p>
          <label className="flex items-center gap-2">
            <input type="radio" name="imp-mode" checked={mode === "add"} onChange={() => setMode("add")} /> Add new lines only (skip lines already here)
          </label>
          {allowReplace && (
            <label className={cn("flex items-center gap-2", !isAdmin && "text-ink-faint")}>
              <input type="radio" name="imp-mode" disabled={!isAdmin} checked={mode === "replace"} onChange={() => setMode("replace")} /> {replaceLabel ?? "Replace all lines with this sheet"}
              {isAdmin ? "" : " (Admins only)"}
            </label>
          )}
          <Issues issues={read.issues} />
        </div>
      )}
      {msg && <p className="mt-3 text-sm text-ink">{msg}</p>}
    </Modal>
  );
}

/** Record history, loaded when opened. */
export function History({ entityType, id }: { entityType: "BatchInward" | "BatchOutward" | "InventoryIssue"; id: string }) {
  const [lines, setLines] = useState<HistoryLine[] | null>(null);
  const [pending, start] = useTransition();
  return (
    <details
      className="mt-4 text-xs"
      onToggle={(e) => {
        if ((e.target as HTMLDetailsElement).open && !lines) start(async () => setLines(await loadHistory(entityType, id)));
      }}
    >
      <summary className="cursor-pointer font-medium text-ink-soft">History</summary>
      {pending && <p className="mt-2 text-ink-faint">Loading…</p>}
      {lines && !lines.length && <p className="mt-2 text-ink-faint">No changes recorded.</p>}
      {lines && lines.length > 0 && (
        <ul className="mt-2 space-y-2">
          {lines.map((l) => (
            <li key={l.id}>
              <span className="text-ink-faint">{formatDmy(l.at)} · {l.who}</span> — {l.message}
              {l.changes.length > 0 && (
                <ul className="ml-4 list-disc text-ink-soft">
                  {l.changes.map(([k, a, b]) => (
                    <li key={k}>
                      {k}: {a} → {b}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
