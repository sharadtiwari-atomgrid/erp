"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { CardBody } from "@/components/ui/card";
import { FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import type { ActionState } from "@/lib/forms";

export type PickLine = {
  id: string;
  productId: string;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  picked: number;
  binId: string | null;
  /** Free + already reserved for this order; a hint only, the server checks. */
  inHand: number;
};

export type PickGroup = { id: string; number: string; subtitle?: string; lines: PickLine[] };

/**
 * Pick sheet for one outbound order or a whole picking session. Posts
 * `pick_<lineId>` and `bin_<lineId>`, plus `intent` = save | complete.
 */
export function PickForm({
  action,
  groups,
  bins,
  binStock,
  completeLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  groups: PickGroup[];
  bins: Array<{ id: string; code: string }>;
  /** Quantity per "binId:productId". */
  binStock: Record<string, number>;
  completeLabel: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const lines = groups.flatMap((g) => g.lines);
  const [picks, setPicks] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.id, String(l.picked)])));

  return (
    <form action={formAction}>
      {(state?.error || state?.success) && (
        <div className="px-5 pt-4">
          <FormMessage state={state} />
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-line text-sm">
          <thead className="bg-muted/60 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="px-4 py-2.5 text-left">Product</th>
              <th className="px-4 py-2.5 text-right">To pick</th>
              <th className="px-4 py-2.5 text-right">In hand</th>
              <th className="w-44 px-4 py-2.5 text-left">From bin</th>
              <th className="w-32 px-4 py-2.5 text-right">Picked</th>
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.id} className="divide-y divide-line">
              {groups.length > 1 && (
                <tr className="bg-muted/30">
                  <td colSpan={5} className="px-4 py-2 text-xs font-semibold text-ink">
                    {g.number}
                    {g.subtitle && <span className="ml-2 font-normal text-ink-soft">{g.subtitle}</span>}
                  </td>
                </tr>
              )}
              {g.lines.map((l) => {
                const value = Number(picks[l.id]);
                const over = value > l.quantity + 0.0005;
                return (
                  <tr key={l.id}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-ink">{l.name}</div>
                      <div className="font-mono text-xs text-ink-faint">{l.sku}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatNumber(l.quantity)} <span className="text-xs text-ink-faint">{l.unit}</span>
                    </td>
                    <td className={cn("px-4 py-2.5 text-right tabular-nums", l.inHand < l.quantity ? "text-amber-700" : "text-ink-soft")}>
                      {formatNumber(l.inHand)}
                    </td>
                    <td className="px-4 py-2">
                      <Select name={`bin_${l.id}`} defaultValue={l.binId ?? ""} aria-label={`Bin for ${l.name}`} disabled={bins.length === 0}>
                        <option value="">{bins.length === 0 ? "No bins" : "Any / unbinned"}</option>
                        {bins.map((b) => {
                          const held = binStock[`${b.id}:${l.productId}`] ?? 0;
                          return (
                            <option key={b.id} value={b.id}>
                              {b.code} ({formatNumber(held)})
                            </option>
                          );
                        })}
                      </Select>
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        name={`pick_${l.id}`}
                        type="number"
                        min="0"
                        max={l.quantity}
                        step="any"
                        value={picks[l.id]}
                        onChange={(e) => setPicks((p) => ({ ...p, [l.id]: e.target.value }))}
                        className={cn("text-right", over && "border-red-500")}
                        aria-label={`Picked quantity of ${l.name}`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>
      <CardBody className="flex flex-wrap items-center justify-between gap-3 border-t border-line">
        <Button variant="ghost" size="sm" onClick={() => setPicks(Object.fromEntries(lines.map((l) => [l.id, String(l.quantity)])))}>
          Fill all quantities
        </Button>
        <div className="flex gap-2">
          <SubmitButton variant="secondary" name="intent" value="save" pendingText="Saving…">
            Save picks
          </SubmitButton>
          <SubmitButton name="intent" value="complete" pendingText="Saving…" confirmMessage="Complete picking with these quantities?">
            {completeLabel}
          </SubmitButton>
        </div>
      </CardBody>
    </form>
  );
}
