"use client";

import { useActionState, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import type { ActionState } from "@/lib/forms";
import { JOURNAL_KINDS, OPENING_DIFFERENCE_TEXT, journalTotals } from "../_gl/ledger";

export type JournalAccountOption = { id: string; code: string; name: string };
export type JournalDimensionOption = { code: string; name: string; values: Array<{ code: string; name: string; isActive: boolean }> };

export type JournalFormLine = {
  accountId: string;
  description: string;
  debit: string;
  credit: string;
  contactId: string;
  dimensions: Record<string, string>;
};

export type JournalFormValues = {
  date: string;
  kind: string;
  narration: string;
  branchId: string;
  lines: JournalFormLine[];
};

let keySeq = 0;
const blank = (): JournalFormLine & { key: number } => ({ key: ++keySeq, accountId: "", description: "", debit: "", credit: "", contactId: "", dimensions: {} });

export function JournalForm({
  action,
  initial,
  accounts,
  contacts,
  dimensions,
  branches,
  openingAccountId,
  cancelHref,
  submitLabel = "Save draft",
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  initial: JournalFormValues;
  accounts: JournalAccountOption[];
  contacts: Array<{ id: string; name: string }>;
  dimensions: JournalDimensionOption[];
  branches: Array<{ id: string; name: string }>;
  openingAccountId: string | null;
  cancelHref: string;
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const [kind, setKind] = useState(initial.kind);
  const [lines, setLines] = useState(() => {
    const start = initial.lines.map((l) => ({ ...l, key: ++keySeq }));
    while (start.length < 2) start.push(blank());
    return start;
  });
  const [showDims, setShowDims] = useState(() => initial.lines.some((l) => Object.keys(l.dimensions).length > 0));

  const opening = kind === "Opening balance";
  // The automatic balancing line is recomputed on save, so leave it out of the running difference.
  const counted = opening ? lines.filter((l) => !(l.accountId === openingAccountId && l.description === OPENING_DIFFERENCE_TEXT)) : lines;
  const totals = journalTotals(counted.map((l) => ({ debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })));

  const update = (i: number, patch: Partial<JournalFormLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const payload = JSON.stringify(
    lines.map((l) => ({
      accountId: l.accountId,
      description: l.description,
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0,
      contactId: l.contactId || null,
      dimensions: l.dimensions,
    })),
  );

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <Card>
        <CardHeader title="General Journal" />
        <CardBody>
          <FormGrid className="lg:grid-cols-4">
            <Field label="Posting Date" htmlFor="date" required>
              <Input id="date" name="date" type="date" defaultValue={initial.date} required />
            </Field>
            <Field label="Kind" htmlFor="kind" required>
              <Select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
                {JOURNAL_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Branch" htmlFor="branchId">
              <Select id="branchId" name="branchId" defaultValue={initial.branchId}>
                <option value="">— None —</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Description" htmlFor="narration" className="lg:col-span-4">
              <Textarea id="narration" name="narration" rows={2} defaultValue={initial.narration} />
            </Field>
          </FormGrid>
          {opening && (
            <p className="mt-3 rounded-md border border-line bg-muted/50 px-3 py-2 text-xs text-ink-soft">
              Enter each account’s opening balance. The difference is balanced automatically to the opening balance equity account when you save.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Lines"
          actions={
            dimensions.length > 0 && (
              <label className="flex items-center gap-2 text-xs text-ink-soft">
                <input type="checkbox" checked={showDims} onChange={(e) => setShowDims(e.target.checked)} className="h-4 w-4 rounded border-line" />
                Dimensions
              </label>
            )
          }
        />
        <input type="hidden" name="lines" value={payload} />
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/60">
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-ink-soft">
                <th className="w-8 px-3 py-2">#</th>
                <th className="min-w-56 px-2 py-2">Account</th>
                <th className="min-w-48 px-2 py-2">Description</th>
                <th className="w-36 px-2 py-2 text-right">Debit Amount</th>
                <th className="w-36 px-2 py-2 text-right">Credit Amount</th>
                <th className="min-w-44 px-2 py-2">Contact</th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lines.map((l, i) => (
                <LineRow
                  key={l.key}
                  index={i}
                  line={l}
                  accounts={accounts}
                  contacts={contacts}
                  dimensions={showDims ? dimensions : []}
                  onChange={(patch) => update(i, patch)}
                  onRemove={lines.length > 1 ? () => setLines((ls) => ls.filter((_, j) => j !== i)) : undefined}
                />
              ))}
            </tbody>
            <tfoot className="border-t border-line bg-muted/40 text-sm">
              <tr>
                <td colSpan={3} className="px-3 py-2.5">
                  <Button variant="secondary" size="sm" onClick={() => setLines((ls) => [...ls, blank()])}>
                    Add line
                  </Button>
                  {!opening && totals.difference !== 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-2"
                      onClick={() =>
                        setLines((ls) => {
                          const amount = Math.abs(totals.difference).toFixed(2);
                          return [...ls, { ...blank(), debit: totals.difference < 0 ? amount : "", credit: totals.difference > 0 ? amount : "" }];
                        })
                      }
                    >
                      Add balancing line
                    </Button>
                  )}
                </td>
                <td className="px-2 py-2.5 text-right font-semibold tabular-nums">{formatMoney(totals.debit)}</td>
                <td className="px-2 py-2.5 text-right font-semibold tabular-nums">{formatMoney(totals.credit)}</td>
                <td colSpan={2} className="px-2 py-2.5">
                  <span
                    className={cn(
                      "text-xs font-medium",
                      totals.difference === 0 ? "text-emerald-600" : opening ? "text-ink-soft" : "text-red-600",
                    )}
                  >
                    {totals.difference === 0
                      ? "Balanced"
                      : opening
                        ? `${formatMoney(Math.abs(totals.difference))} ${totals.difference > 0 ? "Cr" : "Dr"} to opening balance equity`
                        : `Difference ${formatMoney(Math.abs(totals.difference))} ${totals.difference > 0 ? "Dr" : "Cr"}`}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

function LineRow({
  index,
  line,
  accounts,
  contacts,
  dimensions,
  onChange,
  onRemove,
}: {
  index: number;
  line: JournalFormLine;
  accounts: JournalAccountOption[];
  contacts: Array<{ id: string; name: string }>;
  dimensions: JournalDimensionOption[];
  onChange: (patch: Partial<JournalFormLine>) => void;
  onRemove?: () => void;
}) {
  const cell = "h-8 text-sm";
  return (
    <>
      <tr className="align-top">
        <td className="px-3 py-2 text-xs text-ink-faint tabular-nums">{index + 1}</td>
        <td className="px-2 py-1.5">
          <select
            aria-label={`Line ${index + 1} account`}
            value={line.accountId}
            onChange={(e) => onChange({ accountId: e.target.value })}
            className={cn("block w-full rounded-md border border-line bg-surface px-2 text-ink", cell)}
          >
            <option value="">Choose account…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} {a.name}
              </option>
            ))}
          </select>
        </td>
        <td className="px-2 py-1.5">
          <Input aria-label={`Line ${index + 1} description`} value={line.description} onChange={(e) => onChange({ description: e.target.value })} className={cell} />
        </td>
        <td className="px-2 py-1.5">
          <Input
            aria-label={`Line ${index + 1} debit`}
            type="number"
            min="0"
            step="0.01"
            value={line.debit}
            onChange={(e) => onChange({ debit: e.target.value, credit: e.target.value ? "" : line.credit })}
            className={cn(cell, "text-right tabular-nums")}
          />
        </td>
        <td className="px-2 py-1.5">
          <Input
            aria-label={`Line ${index + 1} credit`}
            type="number"
            min="0"
            step="0.01"
            value={line.credit}
            onChange={(e) => onChange({ credit: e.target.value, debit: e.target.value ? "" : line.debit })}
            className={cn(cell, "text-right tabular-nums")}
          />
        </td>
        <td className="px-2 py-1.5">
          <select
            aria-label={`Line ${index + 1} contact`}
            value={line.contactId}
            onChange={(e) => onChange({ contactId: e.target.value })}
            className={cn("block w-full rounded-md border border-line bg-surface px-2 text-ink", cell)}
          >
            <option value="">—</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </td>
        <td className="px-2 py-1.5 text-right">
          {onRemove && (
            <button type="button" onClick={onRemove} className="h-8 px-1 text-ink-faint hover:text-red-600" aria-label={`Remove line ${index + 1}`}>
              ×
            </button>
          )}
        </td>
      </tr>
      {dimensions.length > 0 && (
        <tr>
          <td />
          <td colSpan={5} className="px-2 pb-2">
            <div className="flex flex-wrap gap-2">
              {dimensions.map((d) => (
                <label key={d.code} className="flex items-center gap-1.5 text-xs text-ink-soft">
                  {d.name}
                  <select
                    value={line.dimensions[d.code] ?? ""}
                    onChange={(e) => onChange({ dimensions: { ...line.dimensions, [d.code]: e.target.value } })}
                    className="h-7 rounded-md border border-line bg-surface px-1.5 text-xs text-ink"
                  >
                    <option value="">—</option>
                    {d.values
                      .filter((v) => v.isActive || v.code === line.dimensions[d.code])
                      .map((v) => (
                        <option key={v.code} value={v.code}>
                          {v.name}
                        </option>
                      ))}
                  </select>
                </label>
              ))}
            </div>
          </td>
          <td />
        </tr>
      )}
    </>
  );
}
