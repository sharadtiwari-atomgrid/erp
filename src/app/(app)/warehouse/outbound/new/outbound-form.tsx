"use client";

import { useActionState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormMessage, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import type { ActionState } from "@/lib/forms";

export type OutboundFormLine = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  ordered: number;
  delivered: number;
  onOpenOutbound: number;
  remainder: number;
  reserved: number;
  available: number;
};

/** Quantities to ship per sales order line; defaults to everything not yet delivered or on another open outbound. */
export function OutboundForm({
  action,
  lines,
  cancelHref,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  lines: OutboundFormLine[];
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, undefined);

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <Card>
        <CardHeader title="Quantities to ship" description="Reserved is what the sales order holds in this warehouse; free is in hand minus all reservations." />
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-line text-sm">
            <thead className="bg-muted/60 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-4 py-2.5 text-left">Product</th>
                <th className="px-4 py-2.5 text-right">Ordered</th>
                <th className="px-4 py-2.5 text-right">Delivered</th>
                <th className="px-4 py-2.5 text-right">On open outbounds</th>
                <th className="px-4 py-2.5 text-right">Reserved / free</th>
                <th className="w-36 px-4 py-2.5 text-right">Ship now</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-ink">{l.name}</div>
                    <div className="font-mono text-xs text-ink-faint">{l.sku}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatNumber(l.ordered)} <span className="text-xs text-ink-faint">{l.unit}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(l.delivered)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(l.onOpenOutbound)}</td>
                  <td className={cn("px-4 py-2.5 text-right tabular-nums", l.reserved + l.available < l.remainder && "text-amber-700")}>
                    {formatNumber(l.reserved)} / {formatNumber(l.available)}
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      name={`qty_${l.id}`}
                      type="number"
                      min="0"
                      max={l.remainder}
                      step="any"
                      defaultValue={l.remainder}
                      disabled={l.remainder <= 0}
                      className="text-right"
                      aria-label={`Quantity of ${l.name} to ship`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CardBody className="border-t border-line">
          <Field label="Notes" htmlFor="notes" hint="Optional, e.g. delivery instructions">
            <Textarea id="notes" name="notes" rows={2} />
          </Field>
        </CardBody>
      </Card>
      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton pendingText="Creating…" disabled={lines.every((l) => l.remainder <= 0)}>
          Create outbound order
        </SubmitButton>
      </div>
    </form>
  );
}
