"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { formatDmy } from "@/lib/ops/dates";
import { labelOf, optionLabel, type MisValues } from "./_lib/fields";
import { parseMisPaste } from "./_lib/paste";

const shown = (k: string, v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? formatDmy(v) : optionLabel(k, v));

/** The pasted text, what was understood and what it will change, before anything is filled. */
export function PasteModal({
  current,
  lockJobNo,
  onClose,
  onApply,
}: {
  current: MisValues;
  lockJobNo: boolean;
  onClose: () => void;
  onApply: (values: MisValues) => void;
}) {
  const [text, setText] = useState("");
  const { values, unknown, rows } = useMemo(() => parseMisPaste(text), [text]);
  const keys = Object.keys(values).filter((k) => !(lockJobNo && k === "jobNo"));
  const same = (k: string) => String(current[k] ?? "").trim() === String(values[k]).trim();
  const changes = keys.filter((k) => !same(k));

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="mis-paste-title" className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 id="mis-paste-title" className="text-sm font-semibold text-ink">
            Paste from email
          </h2>
          <button type="button" onClick={onClose} className="text-ink-soft hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-auto px-5 py-4">
          <p className="mb-2 text-xs text-ink-soft">
            Copy the shipment details from the email (lines like “Customer: …”, or a table with a header row) and paste them here. Nothing is filled until you
            confirm.
          </p>
          <Textarea
            rows={8}
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Customer: Example Agro Pvt Ltd\nProduct: Example Technical\nQty: 1000 kg\nBatch No: EX-001\nDelivery address: …"}
            aria-label="Pasted email text"
          />
          {text.trim() && (
            <div className="mt-3 text-sm">
              {!keys.length ? (
                <p className="text-ink-soft">Nothing recognised yet. Use one field per line, like “Customer: Example Agro”.</p>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-ink-faint">
                      <th className="py-1 pr-3 font-semibold">Field</th>
                      <th className="py-1 font-semibold">Will be</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((k) => (
                      <tr key={k} className={same(k) ? "text-ink-faint" : ""}>
                        <th className="border-t border-line py-1.5 pr-3 align-top font-medium whitespace-nowrap">{labelOf(k)}</th>
                        <td className="border-t border-line py-1.5">
                          {shown(k, values[k])}
                          {!same(k) && String(current[k] ?? "").trim() && (
                            <small className="ml-1 text-ink-soft">(replaces “{shown(k, String(current[k]))}”)</small>
                          )}
                          {same(k) && <small className="ml-1">(already this)</small>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {rows > 1 && <p className="mt-2 text-xs text-amber-700">The table has {rows} rows; only the first is used. Paste the others one at a time.</p>}
              {unknown.length > 0 && (
                <p className="mt-2 text-xs text-ink-soft">
                  Not used: {unknown.slice(0, 8).join(", ")}
                  {unknown.length > 8 ? "…" : ""}
                </p>
              )}
              {lockJobNo && values.jobNo && <p className="mt-2 text-xs text-ink-soft">Job No. is fixed on jobs from Fresh PO, so it isn&apos;t changed.</p>}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!changes.length} onClick={() => onApply(Object.fromEntries(changes.map((k) => [k, values[k]])))}>
            {changes.length ? `Fill ${changes.length} field${changes.length === 1 ? "" : "s"}` : "Fill form"}
          </Button>
        </div>
      </div>
    </div>
  );
}
