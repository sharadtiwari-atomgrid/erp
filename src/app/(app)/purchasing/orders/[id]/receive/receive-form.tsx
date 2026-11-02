"use client";

import { useActionState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, FormGrid, FormMessage, Input, Textarea } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatNumber } from "@/lib/format";
import type { ActionState } from "@/lib/forms";

export type ReceiveLine = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  ordered: number;
  received: number;
  remaining: number;
  qcRequired: boolean;
};

export function ReceiveGoodsForm({
  action,
  lines,
  cancelHref,
  today,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  lines: ReceiveLine[];
  cancelHref: string;
  today: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <Card>
        <CardHeader
          title="Quantities received"
          description="Defaults to everything still outstanding; receiving more than ordered is not allowed. Enter 0 for lines not delivered."
        />
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-line text-sm">
            <thead className="bg-muted/60 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="px-4 py-2.5 text-left">Product</th>
                <th className="px-4 py-2.5 text-right">Ordered</th>
                <th className="px-4 py-2.5 text-right">Received</th>
                <th className="px-4 py-2.5 text-right">Remaining</th>
                <th className="w-40 px-4 py-2.5 text-right">Receive now</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-ink">{l.name}</div>
                    <div className="font-mono text-xs text-ink-faint">{l.sku}</div>
                    {l.qcRequired && <Badge tone="amber">QC required</Badge>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(l.ordered)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(l.received)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {formatNumber(l.remaining)} <span className="text-xs text-ink-faint">{l.unit}</span>
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      name={`qty_${l.id}`}
                      type="number"
                      min="0"
                      max={l.remaining}
                      step="any"
                      defaultValue={l.remaining}
                      disabled={l.remaining <= 0}
                      className="text-right"
                      aria-label={`Quantity of ${l.name} to receive`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CardBody className="border-t border-line">
          <FormGrid>
            <Field label="Received on" htmlFor="receivedAt" errors={err.receivedAt}>
              <Input id="receivedAt" name="receivedAt" type="date" defaultValue={today} />
            </Field>
            <Field label="Supplier invoice no." htmlFor="supplierInvoice" errors={err.supplierInvoice}>
              <Input id="supplierInvoice" name="supplierInvoice" />
            </Field>
            <Field label="Vehicle no." htmlFor="vehicleNo" errors={err.vehicleNo} hint="e.g. MH12AB1234">
              <Input id="vehicleNo" name="vehicleNo" className="uppercase" />
            </Field>
            <Field label="Notes" htmlFor="notes" errors={err.notes} hint="Optional, e.g. delivery challan number">
              <Textarea id="notes" name="notes" rows={1} />
            </Field>
          </FormGrid>
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton pendingText="Creating GRN…">Create GRN</SubmitButton>
      </div>
    </form>
  );
}
