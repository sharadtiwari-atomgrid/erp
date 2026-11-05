"use client";

import { Input } from "@/components/ui/form";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { formatDmy } from "@/lib/ops/dates";
import { cn } from "@/lib/cn";
import { sortOldestFirst, type OpenDoc } from "./apply";

export type ApplyDoc = OpenDoc & { total: number; reference?: string | null };

/**
 * Table of a party's open documents with an "Apply" amount per row
 * (Business Central's Apply Entries page). Values are strings so the inputs
 * can be edited freely; the form submits them as JSON.
 */
export function ApplicationsEditor({
  docs,
  values,
  onChange,
  today,
  emptyText,
  docLabel = "Invoice",
}: {
  docs: ApplyDoc[];
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  today: string;
  emptyText: string;
  docLabel?: string;
}) {
  const sorted = sortOldestFirst(docs);
  return (
    <Table>
      <THead>
        <tr>
          <TH>{docLabel}</TH>
          <TH>Posting Date</TH>
          <TH>Due</TH>
          <TH align="right">Total</TH>
          <TH align="right">Open balance</TH>
          <TH align="right">Apply</TH>
        </tr>
      </THead>
      <TBody>
        {sorted.length === 0 && <EmptyRow colSpan={6}>{emptyText}</EmptyRow>}
        {sorted.map((d) => {
          const overdue = (d.dueDate || d.docDate) < today;
          const value = values[d.id] ?? "";
          const over = Number(value) > d.balance + 0.004;
          return (
            <TR key={d.id}>
              <TD>
                <span className="font-medium">{d.number}</span>
                {d.reference && <span className="ml-2 text-xs text-ink-soft">{d.reference}</span>}
              </TD>
              <TD className="text-ink-soft">{formatDmy(d.docDate)}</TD>
              <TD className={cn(overdue ? "text-red-600" : "text-ink-soft")}>{formatDmy(d.dueDate || d.docDate)}</TD>
              <TD align="right">{formatMoney(d.total)}</TD>
              <TD align="right">{formatMoney(d.balance)}</TD>
              <TD align="right" className="w-44">
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    className="text-xs text-brand-700 hover:underline"
                    onClick={() => onChange({ ...values, [d.id]: value ? "" : d.balance.toFixed(2) })}
                  >
                    {value ? "Clear" : "Full"}
                  </button>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    max={d.balance}
                    aria-label={`Amount to apply to ${d.number}`}
                    aria-invalid={over || undefined}
                    value={value}
                    onChange={(e) => onChange({ ...values, [d.id]: e.target.value })}
                    className="w-28 text-right tabular-nums"
                  />
                </div>
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}

/** Applications as submitted by the forms. */
export function applicationsJson(values: Record<string, string>): string {
  return JSON.stringify(
    Object.entries(values)
      .map(([docId, v]) => ({ docId, amount: Number(v) || 0 }))
      .filter((a) => a.amount > 0),
  );
}

export function sumValues(values: Record<string, string>): number {
  return Math.round(Object.values(values).reduce((s, v) => s + (Number(v) || 0), 0) * 100) / 100;
}

/** Summary row of label/amount pairs shown under an applications table. */
export function AmountSummary({ rows }: { rows: Array<{ label: string; value: number; strong?: boolean; tone?: "danger" | "muted" }> }) {
  return (
    <dl className="ml-auto w-full max-w-sm space-y-1 px-5 py-4 text-sm">
      {rows.map((r) => (
        <div key={r.label} className={cn("flex justify-between gap-4", r.strong && "border-t border-line pt-1 font-semibold")}>
          <dt className={cn(r.tone === "muted" ? "text-ink-soft" : "text-ink")}>{r.label}</dt>
          <dd className={cn("tabular-nums", r.tone === "danger" || r.value < -0.004 ? "text-red-600" : "text-ink")}>{formatMoney(r.value)}</dd>
        </div>
      ))}
    </dl>
  );
}
