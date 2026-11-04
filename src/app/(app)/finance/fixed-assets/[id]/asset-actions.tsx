"use client";

import { useActionState, useState } from "react";
import { CardBody } from "@/components/ui/card";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatMoney } from "@/lib/format";
import type { ActionState } from "@/lib/forms";

type Option = { id: string; label: string };
type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export function AcquisitionForm({ action, accounts, defaultDate }: { action: Action; accounts: Option[]; defaultDate: string }) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};
  return (
    <form action={formAction}>
      <CardBody className="space-y-3">
        <FormMessage state={state} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Posting date" htmlFor="acq-date" required errors={err.date}>
            <Input id="acq-date" name="date" type="date" defaultValue={defaultDate} required />
          </Field>
          <Field label="Credit account" htmlFor="acq-credit" required errors={err.creditAccountId} hint="Bank paid from, a payable, or opening balance equity">
            <Select id="acq-credit" name="creditAccountId" defaultValue="" required>
              <option value="">Choose…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="flex justify-end">
          <SubmitButton pendingText="Posting…" confirmMessage="Post the acquisition of this asset to the ledger?">
            Post acquisition
          </SubmitButton>
        </div>
      </CardBody>
    </form>
  );
}

export function DisposalForm({ action, accounts, defaultDate, bookValue }: { action: Action; accounts: Option[]; defaultDate: string; bookValue: number }) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};
  const [sale, setSale] = useState("0");
  const amount = Number(sale) || 0;
  return (
    <form action={formAction}>
      <CardBody className="space-y-3">
        <FormMessage state={state} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Disposal date" htmlFor="dsp-date" required errors={err.date}>
            <Input id="dsp-date" name="date" type="date" defaultValue={defaultDate} required />
          </Field>
          <Field label="Sale amount" htmlFor="dsp-amount" errors={err.saleAmount} hint="0 when scrapped">
            <Input id="dsp-amount" name="saleAmount" type="number" min="0" step="0.01" value={sale} onChange={(e) => setSale(e.target.value)} className="text-right tabular-nums" />
          </Field>
          {amount > 0 && (
            <Field label="Received in" htmlFor="dsp-account" required errors={err.receiveAccountId} className="sm:col-span-2">
              <Select id="dsp-account" name="receiveAccountId" defaultValue="" required>
                <option value="">Choose…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" name="chargeDepreciation" defaultChecked className="h-4 w-4 rounded border-line" />
          Charge depreciation up to the disposal date first
        </label>
        <p className="text-xs text-ink-soft">
          Current book value {formatMoney(bookValue)}. The difference between the sale amount and the book value on the disposal date is posted as a profit or loss on sale of assets.
        </p>
        <div className="flex justify-end">
          <SubmitButton variant="danger" pendingText="Posting…" confirmMessage="Dispose of this asset? This posts to the ledger and can't be edited.">
            {amount > 0 ? "Post sale" : "Scrap asset"}
          </SubmitButton>
        </div>
      </CardBody>
    </form>
  );
}
