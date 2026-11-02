"use client";

import { useActionState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormMessage, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatDate, formatNumber } from "@/lib/format";
import type { ActionState } from "@/lib/forms";

export type PendingOutbound = { id: string; number: string; salesOrder: string; customer: string; createdAt: string; lines: number; units: number };

/** Select pending outbound orders of one warehouse and a picker. */
export function SessionForm({
  action,
  warehouseId,
  outbounds,
  users,
  defaultUserId,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  warehouseId: string;
  outbounds: PendingOutbound[];
  users: Array<{ id: string; name: string }>;
  defaultUserId: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <input type="hidden" name="warehouseId" value={warehouseId} />
      <Card>
        <CardHeader title="Picker" />
        <CardBody>
          <Field label="Assigned to" htmlFor="assignedToId" className="max-w-sm">
            <Select id="assignedToId" name="assignedToId" defaultValue={defaultUserId}>
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Pending outbound orders" description="Only pending orders that are not already in a session are listed." />
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-line text-sm">
            <thead className="bg-muted/60 text-xs font-semibold uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="w-10 px-4 py-2.5" aria-label="Select" />
                <th className="px-4 py-2.5 text-left">Outbound</th>
                <th className="px-4 py-2.5 text-left">Sales order</th>
                <th className="px-4 py-2.5 text-left">Customer</th>
                <th className="px-4 py-2.5 text-left">Created</th>
                <th className="px-4 py-2.5 text-right">Lines</th>
                <th className="px-4 py-2.5 text-right">Units</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {outbounds.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-ink-faint">
                    No pending outbound orders in this warehouse.
                  </td>
                </tr>
              )}
              {outbounds.map((o) => (
                <tr key={o.id} className="hover:bg-muted/40">
                  <td className="px-4 py-2.5">
                    <input type="checkbox" name="outboundId" value={o.id} id={`ob-${o.id}`} defaultChecked className="h-4 w-4 rounded border-line" />
                  </td>
                  <td className="px-4 py-2.5">
                    <label htmlFor={`ob-${o.id}`} className="font-mono font-medium">
                      {o.number}
                    </label>
                  </td>
                  <td className="px-4 py-2.5">{o.salesOrder}</td>
                  <td className="px-4 py-2.5">{o.customer}</td>
                  <td className="px-4 py-2.5 text-ink-soft">{formatDate(o.createdAt)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{o.lines}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(o.units)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="flex justify-end gap-2">
        <ButtonLink href="/warehouse/picking" variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton pendingText="Creating…" disabled={outbounds.length === 0}>
          Create session
        </SubmitButton>
      </div>
    </form>
  );
}
