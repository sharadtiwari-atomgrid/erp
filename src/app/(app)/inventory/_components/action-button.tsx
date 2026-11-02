"use client";

import { useActionState, type ComponentProps, type ReactNode } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/forms";

/**
 * One-button form around a bound server action, e.g. `placePurchaseOrder.bind(null, id)`.
 * Shows the action's error inline next to the button instead of crashing the page.
 */
export function ActionButton({
  action,
  children,
  variant = "secondary",
  size = "md",
  confirmMessage,
  pendingText = "Working…",
  disabled,
  title,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
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
      <SubmitButton variant={variant} size={size} confirmMessage={confirmMessage} pendingText={pendingText} disabled={disabled} title={title}>
        {children}
      </SubmitButton>
      {state?.error && (
        <p role="alert" className="max-w-xs text-right text-xs text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
