"use client";

import { useMemo, useState } from "react";
import { Input, Select, Textarea } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { availableKg, checkBatches, sameProduct, type BatchInStock } from "./_lib/batches";
import { optionLabel, type FieldDef, type MasterList } from "./_lib/fields";
import { downloadUrl, viewUrl, type MisFile } from "./_lib/files";

const kg = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 3 });

/** One scalar field's input, by type. */
export function FieldInput({
  f,
  value,
  onChange,
  disabled,
  masters,
  pocs,
  onPocBlur,
}: {
  f: FieldDef;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  masters: Record<MasterList, readonly string[]>;
  pocs: readonly string[];
  onPocBlur: (v: string) => void;
}) {
  const id = `mis-${f.key}`;
  const common = { id, name: f.key, value: value ?? "", disabled, onChange: (e: { target: { value: string } }) => onChange(e.target.value) };
  switch (f.type) {
    case "computed":
      return <Input id={id} value={value} disabled readOnly placeholder={f.placeholder ?? "auto"} className="tabular-nums" />;
    case "textarea":
      return <Textarea {...common} rows={2} className="resize-y" />;
    case "number":
      return <Input {...common} type="number" step="any" inputMode="decimal" className="tabular-nums" />;
    case "date":
      return <Input {...common} type="date" value={(value ?? "").slice(0, 10)} />;
    case "month":
      return <Input {...common} type="month" />;
    case "datetime":
      return <Input {...common} type="datetime-local" value={(value ?? "").slice(0, 16)} />;
    case "select": {
      const opts = f.options ?? [];
      return (
        <Select {...common}>
          <option value="">— select —</option>
          {opts.map((o) => (
            <option key={o} value={o}>
              {optionLabel(f.key, o)}
            </option>
          ))}
          {value && !opts.includes(value) && <option value={value}>{value} (not in the list)</option>}
        </Select>
      );
    }
    case "master": {
      const listId = `${id}-list`;
      return (
        <>
          <Input {...common} list={listId} autoComplete="off" placeholder="Type to search the master…" />
          <datalist id={listId}>
            {(masters[f.master!] ?? []).map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </>
      );
    }
    case "poc": {
      const listId = `${id}-list`;
      return (
        <>
          <Input {...common} list={listId} autoComplete="off" placeholder="Type or pick a POC…" onBlur={() => onPocBlur(value)} />
          <datalist id={listId}>
            {pocs.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </>
      );
    }
    default:
      return <Input {...common} type="text" inputMode={f.numeric ? "numeric" : undefined} maxLength={f.numeric ? 6 : undefined} />;
  }
}

/** Batch No.: pick from the batches in stock for this product, with stock, "did you mean" and short-stock warnings. */
export function BatchInput({
  value,
  onChange,
  disabled,
  batches,
  product,
  quantity,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  batches: BatchInStock[];
  product: string;
  quantity: string;
}) {
  const mine = useMemo(
    () => batches.filter((b) => sameProduct(b, product)).sort((a, b) => a.batchNo.localeCompare(b.batchNo)),
    [batches, product],
  );
  const typed = value
    .split(/[,;]+/)
    .map((x) => x.trim())
    .slice(0, -1)
    .filter(Boolean);
  const checks = useMemo(() => (batches.length ? checkBatches(value, product, batches) : []), [value, product, batches]);
  const qty = Number(quantity) || 0;
  const avail = availableKg(checks);
  const replace = (from: string, to: string) =>
    onChange(
      value
        .split(/([,;]+)/)
        .map((p) => (p.trim() === from ? to : p))
        .join(""),
    );
  const place = (l: string) => (l.match(/\(([^)]+)\)/) ?? [])[1] ?? l.replace(/^AG\s+|\s*warehouse\s*/gi, "");

  return (
    <>
      <Input
        id="mis-batchNo"
        value={value}
        disabled={disabled}
        list="mis-batches"
        autoComplete="off"
        placeholder={mine.length ? `${mine.length} batch${mine.length > 1 ? "es" : ""} in stock: type or pick` : "Type the batch number"}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id="mis-batches">
        {mine
          .filter((b) => !typed.some((t) => t.toUpperCase() === b.batchNo.toUpperCase()))
          .map((b) => (
            <option key={b.key} value={[...typed, b.batchNo].join(", ")}>
              {`${b.batchNo} · ${kg(b.stock)} kg · ${b.locations.map(place).join(", ")}`}
            </option>
          ))}
      </datalist>
      {checks.length > 0 && (
        <span className="mt-1 flex flex-col gap-0.5 text-xs">
          {checks.map((c, i) => {
            const ok = c.found && !c.otherProduct && !c.suggestion;
            return (
              <span key={i} className={ok ? "text-emerald-700" : "font-medium text-amber-700"}>
                {c.found && !c.suggestion ? (
                  <>
                    ✓ {c.batchNo}: {kg(c.found.stock)} kg in stock{c.otherProduct ? `, but it's ${c.found.material || c.found.productName}` : ""}
                  </>
                ) : c.suggestion ? (
                  <>
                    {c.found ? `${c.batchNo} is written differently in stock` : `${c.batchNo} isn't in stock`}: did you mean <b>{c.suggestion.batchNo}</b>?{" "}
                    {!disabled && (
                      <button type="button" className="rounded-full border border-current px-2 text-[11px]" onClick={() => replace(c.batchNo, c.suggestion!.batchNo)}>
                        Use it
                      </button>
                    )}
                  </>
                ) : (
                  <>{c.batchNo} isn&apos;t in stock: check the number</>
                )}
              </span>
            );
          })}
          {qty > 0 && checks.some((c) => c.found) && avail + 0.0005 < qty && (
            <span className="font-medium text-amber-700">
              Sending {kg(qty)} kg but these batches hold {kg(avail)} kg
            </span>
          )}
        </span>
      )}
    </>
  );
}

/** A document field: its files, plus "upload" (adds, never replaces) and remove per file. */
export function FileInput({
  label,
  files,
  disabled,
  disabledNote,
  onUpload,
  onRemove,
}: {
  label: string;
  files: MisFile[];
  disabled?: boolean;
  disabledNote?: string;
  onUpload: (picked: File[]) => Promise<string | null>;
  onRemove: (f: MisFile) => Promise<string | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const inputId = `mis-file-${label.replace(/\W+/g, "-")}`;

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!picked.length) return;
    setBusy(true);
    setNote("");
    const err = await onUpload(picked);
    setNote(err ?? `Uploaded ${picked.length} file${picked.length > 1 ? "s" : ""} ✓`);
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-1">
      {files.map((file) => {
        const view = viewUrl(file);
        const down = downloadUrl(file);
        return (
          <div key={file.id ?? file.name} className="flex min-h-9 items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1">
            {view ? (
              <a href={view} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm font-medium text-brand-700 hover:underline" title={`View ${file.name}`}>
                📎 {file.name}
              </a>
            ) : (
              <span className="min-w-0 flex-1 truncate text-sm text-ink" title="Only a reference was recorded (from the sheet)">
                📎 {file.name}
              </span>
            )}
            {down && file.key && (
              <a href={down} className="grid size-6 shrink-0 place-items-center rounded bg-brand-50 text-xs font-bold text-brand-700" title={`Download ${file.name}`} aria-label={`Download ${file.name}`}>
                ⬇
              </a>
            )}
            {!disabled && file.id && (
              <button
                type="button"
                className="grid size-6 shrink-0 place-items-center rounded text-ink-soft hover:bg-red-50 hover:text-red-600"
                aria-label={`Remove ${file.name}`}
                title="Remove this file"
                onClick={async () => {
                  if (!window.confirm(`Remove “${file.name}” from ${label}?`)) return;
                  setBusy(true);
                  const err = await onRemove(file);
                  setNote(err ?? "");
                  setBusy(false);
                }}
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
      {disabled ? (
        <span className="text-xs italic text-ink-faint">{disabledNote ?? (files.length ? "" : "No file")}</span>
      ) : (
        <label
          htmlFor={inputId}
          className={cn(
            "inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-dashed border-brand-500/50 bg-brand-50/40 px-3 text-sm font-medium text-brand-700 hover:bg-brand-50",
            busy && "pointer-events-none opacity-60",
          )}
        >
          {busy ? "Working…" : files.length ? "+ Add another file" : "⬆ Upload file"}
          <input id={inputId} type="file" multiple hidden disabled={busy} onChange={pick} />
        </label>
      )}
      {note && <span className="text-xs italic text-ink-soft">{note}</span>}
    </div>
  );
}
