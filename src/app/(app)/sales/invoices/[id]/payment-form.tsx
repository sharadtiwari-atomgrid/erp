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
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  balance: number;
  /** "YYYY-MM-DD", passed from the server so the default doesn't depend on render time. */
  today: string;
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
      </div>
      <div className="flex justify-end">
        <SubmitButton pendingText="Recording…">Record payment</SubmitButton>
      </div>
    </form>
  );
}
