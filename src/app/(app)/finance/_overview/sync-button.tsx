"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/forms";

/** "Post existing sales documents" with its result shown inline. */
export function SyncSalesButton({ action }: { action: () => Promise<ActionState> }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <SubmitButton variant="secondary" size="sm" pendingText="Posting…">
        Post existing sales documents
      </SubmitButton>
      {state?.success && (
        <span role="status" className="text-xs text-emerald-700">
          {state.success}
        </span>
      )}
      {state?.error && (
        <span role="alert" className="text-xs text-red-600">
          {state.error}
        </span>
      )}
    </form>
  );
}
