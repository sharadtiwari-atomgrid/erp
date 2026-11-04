"use client";

import { useActionState } from "react";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { humanize } from "@/lib/format";
import type { ActionState } from "@/lib/forms";
import { PaymentMethod } from "@/generated/prisma/enums";

export function PaymentForm({
  action,
  balance,
  today,
  bankAccounts = [],
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  balance: number;
  /** "YYYY-MM-DD", passed from the server so the default doesn't depend on render time. */
  today: string;
  /** Bank and cash accounts the money can be deposited to. */
  bankAccounts?: Array<{ id: string; code: string; name: string; kind: string }>;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage state={state} />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Date" htmlFor="date" required errors={err.date}>
          <Input id="date" name="date" type="date" defaultValue={today} required />
        </Field>
        <Field label="Amount" htmlFor="amount" required errors={err.amount}>
          <Input id="amount" name="amount" type="number" min="0.01" max={balance} step="0.01" defaultValue={balance} required />
        </Field>
        <Field label="Method" htmlFor="method" required errors={err.method}>
          <Select id="method" name="method" defaultValue="BANK_TRANSFER">
            {Object.values(PaymentMethod).map((m) => (
              <option key={m} value={m}>
                {m === "UPI" ? "UPI" : humanize(m)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reference" htmlFor="reference" errors={err.reference} hint="UTR, cheque no.…">
          <Input id="reference" name="reference" />
        </Field>
        <Field label="Deposit to" htmlFor="bankAccountId" errors={err.bankAccountId} className="col-span-2">
          <Select id="bankAccountId" name="bankAccountId" defaultValue="">
            <option value="">Default (cash for cash payments, else main bank)</option>
            {bankAccounts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.code})
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex justify-end">
        <SubmitButton pendingText="Recording…">Record payment</SubmitButton>
      </div>
    </form>
  );
}
