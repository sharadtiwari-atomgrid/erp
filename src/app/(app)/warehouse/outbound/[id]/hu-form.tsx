"use client";

import { useActionState } from "react";
import { CardBody } from "@/components/ui/card";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatNumber, humanize } from "@/lib/format";
import type { ActionState } from "@/lib/forms";

export type PackLine = { id: string; sku: string; name: string; unit: string; picked: number; packed: number };

const TYPES = ["BOX", "CARTON", "PALLET", "CRATE", "BAG"] as const;

/** Adds one handling unit with the quantity of each line packed into it. Posts qty_<lineId>. */
export function HandlingUnitForm({
  action,
  lines,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  lines: PackLine[];
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};
  const open = lines.filter((l) => l.picked - l.packed > 0.0005);

  return (
    // Keyed on what is left so the defaults refresh after each unit is added.
    <form action={formAction} key={open.map((l) => `${l.id}:${l.packed}`).join("|")}>
      <CardBody className="space-y-4">
        <FormMessage state={state} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Type" htmlFor="hu-type" errors={err.type}>
            <Select id="hu-type" name="type" defaultValue="BOX">
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {humanize(t)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Gross weight (kg)" htmlFor="hu-weight" errors={err.weightKg}>
            <Input id="hu-weight" name="weightKg" type="number" min="0" step="0.001" />
          </Field>
          <Field label="Dimensions" htmlFor="hu-dims" errors={err.dimensions} hint="e.g. 60x40x40 cm">
            <Input id="hu-dims" name="dimensions" />
          </Field>
        </div>
        <div className="overflow-x-auto rounded-md border border-line">
          <table className="min-w-full divide-y divide-line text-sm">
            <thead className="bg-muted/60 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-3 py-2 text-left">Product</th>
                <th className="px-3 py-2 text-right">Picked</th>
                <th className="px-3 py-2 text-right">Left to pack</th>
                <th className="w-32 px-3 py-2 text-right">In this unit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lines.map((l) => {
                const left = Math.max(0, Math.round((l.picked - l.packed) * 1000) / 1000);
                return (
                  <tr key={l.id}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-ink">{l.name}</div>
                      <div className="font-mono text-xs text-ink-faint">{l.sku}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(l.picked)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(left)} <span className="text-xs text-ink-faint">{l.unit}</span>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        name={`qty_${l.id}`}
                        type="number"
                        min="0"
                        max={left}
                        step="any"
                        defaultValue={left}
                        disabled={left <= 0}
                        className="text-right"
                        aria-label={`Quantity of ${l.name} in this unit`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end">
          <SubmitButton pendingText="Adding…" disabled={open.length === 0}>
            Add handling unit
          </SubmitButton>
        </div>
      </CardBody>
    </form>
  );
}
