"use client";

import { useActionState } from "react";
import { FormMessage, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/forms";

export function AddPocForm({ action }: { action: (prev: ActionState, formData: FormData) => Promise<ActionState> }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input name="name" placeholder="Full name" className="max-w-xs" aria-label="POC name" required />
        <SubmitButton pendingText="Adding…">Add POC</SubmitButton>
      </div>
      {state?.fieldErrors?.name?.map((e) => (
        <p key={e} className="text-xs text-red-600">
          {e}
        </p>
      ))}
      <FormMessage state={state} />
    </form>
  );
}

export function RenamePocForm({ name, action }: { name: string; action: (prev: ActionState, formData: FormData) => Promise<ActionState> }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Input name="name" defaultValue={name} className="h-8 max-w-xs text-sm" aria-label={`Rename ${name}`} required />
        <SubmitButton size="sm" variant="secondary" pendingText="Saving…">
          Rename
        </SubmitButton>
      </div>
      {state?.error && (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
