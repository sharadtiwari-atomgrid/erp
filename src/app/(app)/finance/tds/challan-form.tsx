"use client";

import { useActionState, useMemo, useState } from "react";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/forms";

export type PendingEntry = { id: string; date: string; party: string; documentNo: string | null; amount: number };

const fmt = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Select pending entries of one section and record the challan that paid them. */
export function ChallanForm({
  action,
  sectionCode,
  kind,
  entries,
  banks,
  today,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  sectionCode: string;
  kind: string;
  entries: PendingEntry[];
  banks: Array<{ id: string; name: string }>;
  today: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(entries.map((e) => e.id)));
  const total = useMemo(() => Math.round(entries.filter((e) => selected.has(e.id)).reduce((s, e) => s + e.amount, 0) * 100) / 100, [entries, selected]);
  const [amount, setAmount] = useState<string>("");
  const err = state?.fieldErrors ?? {};
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <div className="max-h-72 overflow-y-auto rounded-md border border-line">
        <table className="min-w-full divide-y divide-line text-sm">
          <thead className="bg-muted/60 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={selected.size === entries.length}
                  onChange={(e) => setSelected(e.target.checked ? new Set(entries.map((x) => x.id)) : new Set())}
                />
              </th>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Party</th>
              <th className="px-3 py-2 text-left">Document</th>
              <th className="px-3 py-2 text-right">{kind}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {entries.map((e) => (
              <tr key={e.id} className="hover:bg-muted/30">
                <td className="px-3 py-1.5 text-center">
                  <input type="checkbox" name="entryIds" value={e.id} checked={selected.has(e.id)} onChange={() => toggle(e.id)} aria-label={`Select ${e.party}`} />
                </td>
                <td className="px-3 py-1.5 text-ink-soft">{e.date}</td>
                <td className="px-3 py-1.5">{e.party}</td>
                <td className="px-3 py-1.5 text-ink-soft">{e.documentNo ?? "—"}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmt.format(e.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-ink-soft">
        Selected: <strong className="tabular-nums text-ink">₹{fmt.format(total)}</strong> of section {sectionCode} ({selected.size} of {entries.length}{" "}
        entries)
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Challan no. (CIN / BSR + serial)" htmlFor="challanNo" required errors={err.challanNo}>
          <Input id="challanNo" name="challanNo" required />
        </Field>
        <Field label="Challan date" htmlFor="challanDate" required errors={err.challanDate}>
          <Input id="challanDate" name="challanDate" type="date" defaultValue={today} max={today} required />
        </Field>
        <Field label="Amount paid" htmlFor="amount" required errors={err.amount} hint="Must match the selected tax (±₹1 rounding).">
          <Input id="amount" name="amount" type="number" step="0.01" min="0.01" value={amount || (total ? String(total) : "")} onChange={(e) => setAmount(e.target.value)} required />
        </Field>
        <Field label="Paid from" htmlFor="bankAccountId" errors={err.bankAccountId}>
          <Select id="bankAccountId" name="bankAccountId" defaultValue={banks[0]?.id ?? ""}>
            <option value="">—</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="postToLedger" defaultChecked />
          Post the payment to the ledger (Dr {kind} payable / Cr bank)
        </label>
        <SubmitButton pendingText="Recording…" disabled={selected.size === 0}>
          Record challan
        </SubmitButton>
      </div>
    </form>
  );
}
