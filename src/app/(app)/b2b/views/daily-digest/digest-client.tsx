"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { addDaysIso } from "@/lib/ops/dates";
import { uploadWarehouseMis } from "./actions";

/*
 * The daily digest's browser side: each report renders as a PNG (html-to-image)
 * to copy straight into the team chat or download; "Download all" saves every one.
 */

const NODE_ATTR = "data-digest-report";

async function shot(node: HTMLElement): Promise<Blob> {
  const { toBlob } = await import("html-to-image");
  const blob = await toBlob(node, { pixelRatio: 2, backgroundColor: "#ffffff", skipFonts: true, width: node.scrollWidth, height: node.scrollHeight });
  if (!blob) throw new Error("Could not render the report.");
  return blob;
}

function save(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function flash(setNote: (s: string) => void, text: string) {
  setNote(text);
  setTimeout(() => setNote(""), 4000);
}

/** One report: a title bar with Copy image / Download, and the sheet itself. */
export function DigestBox({ id, label, day, extra, children }: { id: string; label: string; day: string; extra?: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState("");
  const fileName = `${id}-${day}.png`;

  const copy = async () => {
    const node = ref.current;
    if (!node) return;
    try {
      if (typeof window.ClipboardItem === "undefined" || !navigator.clipboard?.write) throw new Error("no clipboard");
      await navigator.clipboard.write([new window.ClipboardItem({ "image/png": shot(node) })]);
      flash(setNote, `${label} copied — paste it into the chat.`);
    } catch {
      try {
        save(await shot(node), fileName);
        flash(setNote, `Your browser can't copy images, so ${label} was downloaded instead.`);
      } catch (e) {
        flash(setNote, e instanceof Error ? e.message : String(e));
      }
    }
  };
  const download = async () => {
    if (ref.current) save(await shot(ref.current), fileName);
  };

  return (
    <section className="overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-2.5">
        <b className="text-sm text-ink">{label}</b>
        {extra}
        <span className="flex-1" />
        {note && (
          <span role="status" className="text-xs font-medium text-emerald-700">
            {note}
          </span>
        )}
        <Button variant="secondary" size="sm" onClick={copy}>
          Copy image
        </Button>
        <Button variant="secondary" size="sm" onClick={download}>
          Download
        </Button>
      </div>
      <div className="max-h-[80vh] overflow-auto bg-white p-3.5">
        <div ref={ref} data-digest-report={fileName} className="rp">
          {children}
        </div>
      </div>
    </section>
  );
}

/** Day picker (‹ date ›, back to today) and "Download all". */
export function DigestToolbar({ day, today }: { day: string; today: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const go = (d: string) => router.push(d === today ? "/b2b/views/daily-digest" : `/b2b/views/daily-digest?day=${d}`);

  const downloadAll = async () => {
    setBusy(true);
    try {
      for (const node of document.querySelectorAll<HTMLElement>(`[${NODE_ATTR}]`)) {
        save(await shot(node), node.getAttribute(NODE_ATTR) ?? "report.png");
        await new Promise((r) => setTimeout(r, 300));
      }
      flash(setNote, "All reports downloaded.");
    } catch (e) {
      flash(setNote, e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" size="sm" onClick={() => go(addDaysIso(day, -1))} aria-label="Day before">
        ‹
      </Button>
      <Input type="date" value={day} max={today} onChange={(e) => e.target.value && go(e.target.value)} className="w-auto" aria-label="Day" />
      <Button variant="secondary" size="sm" disabled={day >= today} onClick={() => go(addDaysIso(day, 1))} aria-label="Next day">
        ›
      </Button>
      {day !== today ? (
        <Button variant="ghost" size="sm" onClick={() => go(today)}>
          Today
        </Button>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => router.refresh()}>
          Update the time
        </Button>
      )}
      <span className="flex-1" />
      {note && <span className="text-xs font-medium text-emerald-700">{note}</span>}
      <Button onClick={downloadAll} disabled={busy}>
        {busy ? "Downloading…" : "Download all"}
      </Button>
    </div>
  );
}

/** Upload the warehouse's MIS workbook (its "Stock in Hand" tab) for the inventory report. */
export function WarehouseUpload() {
  const [state, action, pending] = useActionState(uploadWarehouseMis, undefined);
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} className="inline-flex items-center gap-2">
      <label className="inline-flex h-8 cursor-pointer items-center rounded-md border border-line bg-surface px-2.5 text-xs font-medium text-ink shadow-sm hover:bg-muted">
        {pending ? "Reading…" : "Upload warehouse MIS"}
        <input type="file" name="file" hidden accept=".xlsx,.xls,.csv" onChange={() => form.current?.requestSubmit()} />
      </label>
      {state?.error && <span className="text-xs text-red-600">{state.error}</span>}
      {state?.success && <span className="text-xs text-emerald-700">{state.success}</span>}
    </form>
  );
}
