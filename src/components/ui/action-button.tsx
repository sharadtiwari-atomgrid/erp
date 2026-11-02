"use client";

import { useActionState, type ComponentProps, type ReactNode } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/forms";

/**
 * One-click status change (Confirm, Place order, Cancel…). Wraps a bound
 * server action, e.g. `confirmOrder.bind(null, id)`, and shows its error
 * inline under the button. Pass `fields` to post extra inputs alongside,
 * e.g. a warehouse picker.
 */
export function ActionButton({
  action,
  children,
  fields,
  variant = "secondary",
  size = "md",
  confirmMessage,
  pendingText = "Working…",
  disabled,
  title,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
  fields?: ReactNode;
  variant?: ComponentProps<typeof SubmitButton>["variant"];
  size?: ComponentProps<typeof SubmitButton>["size"];
  confirmMessage?: string;
  pendingText?: string;
  disabled?: boolean;
  title?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {fields}
        <SubmitButton variant={variant} size={size} confirmMessage={confirmMessage} pendingText={pendingText} disabled={disabled} title={title}>
          {children}
        </SubmitButton>
      </div>
      {state?.error && (
        <p role="alert" className="max-w-xs text-right text-xs text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
