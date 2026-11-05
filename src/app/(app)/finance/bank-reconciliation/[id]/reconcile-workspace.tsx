"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";
import { money } from "@/lib/finance/chart";
import { formatMoney } from "@/lib/format";
import type { ActionState } from "@/lib/forms";
import { formatDmy } from "@/lib/ops/dates";
import { createEntryFromLine, deleteLine, ignoreLine, matchLine } from "../actions";

export type WorkspaceLine = { id: string; date: string; description: string; reference: string | null; amount: number };
export type WorkspaceEntry = {
  id: string;
  date: string;
  documentType: string;
  documentNo: string | null;
  description: string | null;
  contactName: string | null;
  debit: number;
  credit: number;
};
export type AccountOption = { id: string; code: string; name: string };

const signed = (n: number) => (n < 0 ? `(${formatMoney(-n)})` : formatMoney(n));

export function ReconcileWorkspace({
  bankAccountId,
  canEdit,
  lines,
  entries,
  accounts,
  chargesAccountId,
  incomeAccountId,
}: {
  bankAccountId: string;
  canEdit: boolean;
  lines: WorkspaceLine[];
  entries: WorkspaceEntry[];
  accounts: AccountOption[];
  chargesAccountId?: string;
  incomeAccountId?: string;
}) {
  const [lineId, setLineId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [onlySameAmount, setOnlySameAmount] = useState(false);
  const [message, setMessage] = useState<ActionState>(undefined);
  const [pending, startTransition] = useTransition();
  const [booking, setBooking] = useState(false);

  const line = lines.find((l) => l.id === lineId) ?? null;
  const pickedTotal = money(entries.filter((e) => picked.has(e.id)).reduce((s, e) => s + e.debit - e.credit, 0));
  const canMatch = !!line && picked.size > 0 && pickedTotal === money(line.amount);

  const q = query.trim().toLowerCase();
  const shownEntries = entries.filter((e) => {
    if (onlySameAmount && line && money(e.debit - e.credit) !== money(line.amount)) return false;
    if (!q) return true;
    return [e.documentNo, e.description, e.contactName, e.documentType, String(e.debit || e.credit)].some((v) => v?.toLowerCase().includes(q));
  });

  function selectLine(id: string) {
    setLineId(id === lineId ? null : id);
    setPicked(new Set());
    setBooking(false);
    setMessage(undefined);
  }

  function toggle(id: string) {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  }

  function run(fn: () => Promise<ActionState>, after?: () => void) {
    startTransition(async () => {
      const r = await fn();
      setMessage(r);
      if (!r?.error) after?.();
    });
  }

  return (
    <div className="space-y-4">
      <FormMessage state={message} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title={`Statement lines not matched (${lines.length})`} description="Pick a line, then tick the ledger entries it pays or receives." />
          <div className="max-h-[32rem] overflow-y-auto">
            <table className="min-w-full divide-y divide-line text-sm">
              <thead className="sticky top-0 bg-muted">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  <th className="px-3 py-2">Posting Date</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  {canEdit && <th className="px-3 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-ink-faint">
                      Nothing to match. Import a statement to start.
                    </td>
                  </tr>
                )}
                {lines.map((l) => (
                  <tr
                    key={l.id}
                    onClick={() => selectLine(l.id)}
                    className={cn("cursor-pointer", l.id === lineId ? "bg-brand-50 ring-1 ring-inset ring-brand-500" : "hover:bg-muted/40")}
                  >
                    <td className="whitespace-nowrap px-3 py-2 align-top">{formatDmy(l.date)}</td>
                    <td className="px-3 py-2 align-top text-xs">
                      {l.description}
                      {l.reference && <div className="font-mono text-ink-faint">{l.reference}</div>}
                    </td>
                    <td className={cn("whitespace-nowrap px-3 py-2 text-right align-top tabular-nums", l.amount < 0 && "text-red-600")}>{signed(l.amount)}</td>
                    {canEdit && (
                      <td className="whitespace-nowrap px-3 py-2 text-right align-top" onClick={(e) => e.stopPropagation()}>
                        <button type="button" disabled={pending} className="text-xs text-ink-soft hover:text-ink" onClick={() => run(() => ignoreLine(l.id), () => setLineId(null))}>
                          Ignore
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          className="ml-3 text-xs text-red-600 hover:underline"
                          onClick={() => window.confirm("Delete this imported line?") && run(() => deleteLine(l.id), () => setLineId(null))}
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader
            title={`Ledger entries not cleared (${entries.length})`}
            description="Debits are money in, credits money out."
            actions={
              <label className="flex items-center gap-1.5 text-xs text-ink-soft">
                <input type="checkbox" checked={onlySameAmount} onChange={(e) => setOnlySameAmount(e.target.checked)} className="h-3.5 w-3.5 rounded border-line" />
                Same amount only
              </label>
            }
          />
          <div className="border-b border-line px-3 py-2">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search document, party, amount" aria-label="Search entries" />
          </div>
          <div className="max-h-[29rem] overflow-y-auto">
            <table className="min-w-full divide-y divide-line text-sm">
              <thead className="sticky top-0 bg-muted">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  <th className="w-8 px-3 py-2" />
                  <th className="px-3 py-2">Posting Date</th>
                  <th className="px-3 py-2">Document No.</th>
                  <th className="px-3 py-2 text-right">Debit Amount</th>
                  <th className="px-3 py-2 text-right">Credit Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shownEntries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-ink-faint">
                      No uncleared entries.
                    </td>
                  </tr>
                )}
                {shownEntries.map((e) => {
                  const same = line && money(e.debit - e.credit) === money(line.amount);
                  return (
                    <tr key={e.id} className={cn(picked.has(e.id) ? "bg-brand-50" : same ? "bg-emerald-50/60" : "hover:bg-muted/40", line && canEdit && "cursor-pointer")} onClick={() => line && canEdit && toggle(e.id)}>
                      <td className="px-3 py-2 align-top">
                        <input type="checkbox" checked={picked.has(e.id)} disabled={!line || !canEdit} onChange={() => toggle(e.id)} onClick={(ev) => ev.stopPropagation()} aria-label="Select entry" className="h-4 w-4 rounded border-line" />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 align-top">{formatDmy(e.date)}</td>
                      <td className="px-3 py-2 align-top text-xs">
                        <span className="text-ink-soft">{e.documentType}</span> <span className="font-mono">{e.documentNo}</span>
                        <div className="text-ink-faint">{[e.contactName, e.description].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right align-top tabular-nums">{e.debit ? formatMoney(e.debit) : ""}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right align-top tabular-nums">{e.credit ? formatMoney(e.credit) : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {line && canEdit && (
        <Card>
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-ink">
              Line <span className="font-medium">{formatDmy(line.date)}</span> {line.description}: <span className="font-medium tabular-nums">{signed(line.amount)}</span>
              <span className="mx-2 text-ink-faint">·</span>
              Selected entries: <span className={cn("font-medium tabular-nums", picked.size > 0 && !canMatch && "text-red-600")}>{signed(pickedTotal)}</span>
              {picked.size > 0 && !canMatch && <span className="ml-2 text-xs text-red-600">differs by {signed(money(line.amount - pickedTotal))}</span>}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setBooking((b) => !b)}>
                {booking ? "Close" : "Create entry from line"}
              </Button>
              <Button
                disabled={!canMatch || pending}
                onClick={() =>
                  run(
                    () => matchLine(bankAccountId, line.id, [...picked]),
                    () => {
                      setLineId(null);
                      setPicked(new Set());
                    },
                  )
                }
              >
                {pending ? "Matching…" : "Match"}
              </Button>
            </div>
          </CardBody>
          {booking && (
            <BookEntryForm
              key={line.id}
              bankAccountId={bankAccountId}
              line={line}
              accounts={accounts}
              defaultAccountId={(line.amount < 0 ? chargesAccountId : incomeAccountId) ?? ""}
              onDone={() => {
                setLineId(null);
                setBooking(false);
              }}
            />
          )}
        </Card>
      )}
    </div>
  );
}

function BookEntryForm({
  bankAccountId,
  line,
  accounts,
  defaultAccountId,
  onDone,
}: {
  bankAccountId: string;
  line: WorkspaceLine;
  accounts: AccountOption[];
  defaultAccountId: string;
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await createEntryFromLine(bankAccountId, prev, fd);
    if (r?.success) onDone();
    return r;
  }, undefined);
  const err = state?.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-3 border-t border-line px-5 py-4">
      <p className="text-xs text-ink-soft">
        {line.amount < 0
          ? `Posts Dr the chosen account / Cr the bank for ${formatMoney(-line.amount)} (e.g. bank charges).`
          : `Posts Dr the bank / Cr the chosen account for ${formatMoney(line.amount)} (e.g. interest received).`}{" "}
        The line is then matched to the new entry.
      </p>
      <FormMessage state={state?.error ? state : undefined} />
      <input type="hidden" name="lineId" value={line.id} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Account" htmlFor="book-account" required errors={err.accountId}>
          <Select id="book-account" name="accountId" defaultValue={defaultAccountId} required>
            <option value="">Choose…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} · {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Posting date" htmlFor="book-date" required errors={err.date}>
          <Input id="book-date" name="date" type="date" defaultValue={line.date} required />
        </Field>
        <Field label="Description" htmlFor="book-description" errors={err.description}>
          <Input id="book-description" name="description" defaultValue={line.description} />
        </Field>
      </div>
      <div className="flex justify-end">
        <SubmitButton pendingText="Posting…">Post and match</SubmitButton>
      </div>
    </form>
  );
}
