"use client";

import { useActionState } from "react";
import { FormMessage, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/forms";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

export function NewCategoryForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-3 border-b border-line px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input name="name" placeholder="New category name" aria-label="New category name" className="max-w-xs" required />
        <SubmitButton pendingText="Adding…">Add category</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

/** Inline rename: the input submits on Enter or via the Save button. */
export function RenameCategoryForm({ action, name }: { action: Action; name: string }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <Input name="name" defaultValue={name} aria-label="Category name" className="h-8 max-w-60" required />
      <SubmitButton variant="secondary" size="sm">
        Save
      </SubmitButton>
      {state?.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
