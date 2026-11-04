"use client";

import { useActionState } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatMoney } from "@/lib/format";
import { transferFunds } from "./actions";

export type TransferAccount = { id: string; code: string; name: string; balance: number };

export function TransferForm({ accounts, today, defaultFrom }: { accounts: TransferAccount[]; today: string; defaultFrom?: string }) {
  const [state, formAction] = useActionState(transferFunds, undefined);
  const err = state?.fieldErrors ?? {};
  const label = (a: TransferAccount) => `${a.code} · ${a.name} (${formatMoney(a.balance)})`;
  return (
    <form action={formAction} className="space-y-6">
      <FormMessage state={state} />
      <Card>
        <CardHeader title="Contra entry" description="Posts Dr the destination account / Cr the source account." />
        <CardBody>
          <FormGrid>
            <Field label="From (credit)" htmlFor="fromId" required errors={err.fromId}>
              <Select id="fromId" name="fromId" defaultValue={defaultFrom ?? ""} required>
                <option value="">Choose…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {label(a)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="To (debit)" htmlFor="toId" required errors={err.toId}>
              <Select id="toId" name="toId" defaultValue="" required>
                <option value="">Choose…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {label(a)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date" htmlFor="date" required errors={err.date}>
              <Input id="date" name="date" type="date" defaultValue={today} required />
            </Field>
            <Field label="Amount" htmlFor="amount" required errors={err.amount}>
              <Input id="amount" name="amount" type="number" min="0.01" step="0.01" required className="text-right tabular-nums" />
            </Field>
            <Field label="Reference" htmlFor="reference" errors={err.reference} hint="Cheque no. / UTR">
              <Input id="reference" name="reference" />
            </Field>
            <Field label="Narration" htmlFor="narration" errors={err.narration}>
              <Input id="narration" name="narration" />
            </Field>
          </FormGrid>
        </CardBody>
      </Card>
      <div className="flex justify-end gap-2">
        <ButtonLink href="/finance/bank-accounts" variant="secondary">
          Cancel
        </ButtonLink>
        <SubmitButton pendingText="Posting…">Post transfer</SubmitButton>
      </div>
    </form>
  );
}
