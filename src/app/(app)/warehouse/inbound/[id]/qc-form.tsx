"use client";

import { useActionState, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { CardBody } from "@/components/ui/card";
import { FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";
import { formatMoney, formatNumber } from "@/lib/format";
import type { ActionState } from "@/lib/forms";

export type QcLine = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  qcRequired: boolean;
  received: number;
  unitCost: number;
  /** Prefilled accepted quantity (full for items without QC, blank otherwise). */
  accepted: number | null;
};

type Entry = { accepted: string; rejected: string };

const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

/** Per-line QC entry: accepted + rejected must equal received; optional putaway bin. */
export function QcForm({
  action,
  lines,
  bins,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  lines: QcLine[];
  bins: Array<{ id: string; code: string; zone: string | null }>;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const [entries, setEntries] = useState<Record<string, Entry>>(() =>
    Object.fromEntries(
      lines.map((l) => [
        l.id,
        l.accepted === null ? { accepted: "", rejected: "" } : { accepted: String(l.accepted), rejected: String(r3(l.received - l.accepted)) },
      ]),
    ),
  );

  /** Typing one side fills in the other so the pair always adds up to received. */
  function set(line: QcLine, field: keyof Entry, value: string) {
    const n = Number(value);
    const other = value === "" || !Number.isFinite(n) ? "" : String(Math.max(0, r3(line.received - n)));
    setEntries((e) => ({ ...e, [line.id]: field === "accepted" ? { accepted: value, rejected: other } : { accepted: other, rejected: value } }));
  }

  return (
    <form action={formAction}>
      {state?.error && (
        <div className="px-5 pt-4">
          <FormMessage state={state} />
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-line text-sm">
          <thead className="bg-muted/60 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="px-4 py-2.5 text-left">Product</th>
              <th className="px-4 py-2.5 text-right">Received</th>
              <th className="w-32 px-4 py-2.5 text-right">Accepted</th>
              <th className="w-32 px-4 py-2.5 text-right">Rejected</th>
              <th className="px-4 py-2.5 text-left">QC notes</th>
              <th className="w-40 px-4 py-2.5 text-left">Put away to bin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map((l) => {
              const e = entries[l.id];
              const sum = (Number(e.accepted) || 0) + (Number(e.rejected) || 0);
              const mismatch = e.accepted !== "" && e.rejected !== "" && Math.abs(sum - l.received) > 0.0005;
              return (
                <tr key={l.id}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-ink">{l.name}</div>
                    <div className="font-mono text-xs text-ink-faint">
                      {l.sku} · {formatMoney(l.unitCost)}
                    </div>
                    {l.qcRequired ? <Badge tone="amber">QC required</Badge> : <span className="text-xs text-ink-faint">No QC needed</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatNumber(l.received)} <span className="text-xs text-ink-faint">{l.unit}</span>
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      name={`accepted_${l.id}`}
                      type="number"
                      min="0"
                      max={l.received}
                      step="any"
                      required
                      value={e.accepted}
                      onChange={(ev) => set(l, "accepted", ev.target.value)}
                      className={cn("text-right", mismatch && "border-red-500")}
                      aria-label={`Accepted quantity of ${l.name}`}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      name={`rejected_${l.id}`}
                      type="number"
                      min="0"
                      max={l.received}
                      step="any"
                      required
                      value={e.rejected}
                      onChange={(ev) => set(l, "rejected", ev.target.value)}
                      className={cn("text-right", mismatch && "border-red-500")}
                      aria-label={`Rejected quantity of ${l.name}`}
                    />
                  </td>
                  <td className="px-4 py-2">
                    <Input name={`notes_${l.id}`} placeholder="Optional" aria-label={`QC notes for ${l.name}`} />
                  </td>
                  <td className="px-4 py-2">
                    <Select name={`bin_${l.id}`} defaultValue="" aria-label={`Putaway bin for ${l.name}`} disabled={bins.length === 0}>
                      <option value="">{bins.length === 0 ? "No bins" : "No bin"}</option>
                      {bins.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.code}
                          {b.zone ? ` (${b.zone})` : ""}
                        </option>
                      ))}
                    </Select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <CardBody className="flex flex-wrap items-center justify-between gap-3 border-t border-line">
        <p className="text-xs text-ink-soft">Completing QC posts the accepted quantity to stock at the line&apos;s unit cost. This cannot be undone.</p>
        <SubmitButton pendingText="Completing…" confirmMessage="Complete QC and post accepted stock?">
          Complete QC
        </SubmitButton>
      </CardBody>
    </form>
  );
}
