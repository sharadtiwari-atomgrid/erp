"use client";

import { useActionState } from "react";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/forms";

/** ARN + filing date form for "Mark as filed". */
export function MarkFiledForm({
  action,
  type,
  period,
  today,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  type: string;
  period: string;
  today: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const err = state?.fieldErrors ?? {};
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="period" value={period} />
      <FormMessage state={state} />
      <div className="flex flex-wrap items-end gap-3">
        <Field label="ARN" htmlFor={`arn-${type}`} required errors={err.arn} className="w-56">
          <Input id={`arn-${type}`} name="arn" required placeholder="AA2710260000000" />
        </Field>
        <Field label="Filed on" htmlFor={`filedOn-${type}`} required errors={err.filedOn} className="w-44">
          <Input id={`filedOn-${type}`} name="filedOn" type="date" defaultValue={today} max={today} required />
        </Field>
        <Field label="Notes" htmlFor={`notes-${type}`} className="min-w-48 flex-1">
          <Input id={`notes-${type}`} name="notes" />
        </Field>
        <SubmitButton pendingText="Saving…" confirmMessage={`Mark ${type} for ${period} as filed? The current figures are saved as filed.`}>
          Mark as filed
        </SubmitButton>
      </div>
    </form>
  );
}
