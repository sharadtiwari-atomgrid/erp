"use client";

import { useActionState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { FormMessage, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import type { ActionState } from "@/lib/forms";

export type DeliveryRow = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  isService: boolean;
  ordered: number;
  delivered: number;
  remaining: number;
  onHand: number;
};

export function DeliverForm({
  action,
  rows,
  warehouseName,
  cancelHref,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  rows: DeliveryRow[];
  warehouseName: string;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState(action, undefined);

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <Card>
        <CardHeader title="Quantities to deliver" description={`Stock is taken from ${warehouseName}. Services are marked delivered without moving stock.`} />
        <Table>
          <THead>
            <tr>
              <TH>Product</TH>
              <TH align="right">Ordered</TH>
              <TH align="right">Delivered</TH>
              <TH align="right">Remaining</TH>
              <TH align="right">On hand</TH>
              <TH align="right">Deliver now</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD>
                  <div className="font-medium">{r.name}</div>
                  <div className="font-mono text-xs text-ink-faint">{r.sku}</div>
                </TD>
                <TD align="right">{formatNumber(r.ordered)}</TD>
                <TD align="right">{formatNumber(r.delivered)}</TD>
                <TD align="right">{formatNumber(r.remaining)}</TD>
                <TD align="right" className={!r.isService && r.onHand < r.remaining ? "text-red-600" : undefined}>
                  {r.isService ? "—" : formatNumber(r.onHand)}
                </TD>
                <TD align="right">
                  {r.remaining > 0 ? (
                    <div className="flex items-center justify-end gap-1.5">
                      <Input
                        type="number"
                        name={`qty_${r.id}`}
                        min="0"
                        max={r.remaining}
                        step="any"
                        defaultValue={r.remaining}
                        className="w-28 text-right"
                        aria-label={`Quantity of ${r.name} to deliver`}
                      />
                      <span className="w-10 text-left text-xs text-ink-faint">{r.unit}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-ink-faint">Fully delivered</span>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <div className="flex justify-end gap-2">
        <ButtonLink href={cancelHref} variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton pendingText="Delivering…">Deliver</SubmitButton>
      </div>
    </form>
  );
}
