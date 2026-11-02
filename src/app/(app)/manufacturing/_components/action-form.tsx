"use client";

import { useActionState, type ComponentProps, type ReactNode } from "react";
import { FormMessage } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/forms";
import { cn } from "@/lib/cn";

/**
 * Small form around a bound server action that shows its error / success
 * message and field errors inline. Fields are passed as children.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingText = "Working…",
  variant = "primary",
  confirmMessage,
  className,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children?: ReactNode;
  submitLabel: ReactNode;
  pendingText?: string;
  variant?: ComponentProps<typeof SubmitButton>["variant"];
  confirmMessage?: string;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const fieldErrors = Object.values(state?.fieldErrors ?? {})
    .flat()
    .filter(Boolean) as string[];
  return (
    <form action={formAction} className={cn("space-y-3", className)}>
      <FormMessage state={state} />
      {fieldErrors.length > 0 && !state?.error && (
        <ul className="text-xs text-red-600">
          {fieldErrors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {children}
      <SubmitButton variant={variant} pendingText={pendingText} confirmMessage={confirmMessage}>
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
