"use client";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/** Submit button that disables itself and shows a pending label while the form's action runs. */
export function SubmitButton({
  children,
  pendingText = "Saving…",
  confirmMessage,
  ...props
}: ComponentProps<typeof Button> & { pendingText?: string; confirmMessage?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending || props.disabled}
      onClick={(e) => {
        if (confirmMessage && !window.confirm(confirmMessage)) e.preventDefault();
      }}
      {...props}
    >
      {pending ? pendingText : children}
    </Button>
  );
}
