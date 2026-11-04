"use client";

import { useActionState, type ComponentProps, type ReactNode } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/cn";
import type { ActionState } from "@/lib/forms";

/** A one-row form (inputs + submit) that shows the action's error or success message beneath it. */
export function InlineForm({
  action,
  children,
  submitLabel,
  variant = "secondary",
  size = "sm",
  confirmMessage,
  className,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children?: ReactNode;
  submitLabel: ReactNode;
  variant?: ComponentProps<typeof SubmitButton>["variant"];
  size?: ComponentProps<typeof SubmitButton>["size"];
  confirmMessage?: string;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={cn("flex flex-col gap-1", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <SubmitButton variant={variant} size={size} confirmMessage={confirmMessage} pendingText="…">
          {submitLabel}
        </SubmitButton>
      </div>
      {state?.error && (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      )}
      {state?.success && (
        <p role="status" className="text-xs text-emerald-600">
          {state.success}
        </p>
      )}
    </form>
  );
}
