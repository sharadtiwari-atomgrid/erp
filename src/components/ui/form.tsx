import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { ActionState } from "@/lib/forms";

const control =
  "block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink shadow-sm placeholder:text-ink-faint focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-muted aria-invalid:border-red-500";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-9 py-0", className)} {...props} />;
}

export function Textarea({ className, rows = 3, ...props }: ComponentProps<"textarea">) {
  return <textarea rows={rows} className={cn(control, className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(control, "h-9 py-0 pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("mb-1.5 block text-sm font-medium text-ink", className)} {...props} />;
}

/** Label + control + hint + validation error. Pass the field's errors from ActionState.fieldErrors. */
export function Field({
  label,
  htmlFor,
  hint,
  errors,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  errors?: string[];
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </Label>
      {children}
      {hint && !errors?.length && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
      {errors?.map((e) => (
        <p key={e} className="mt-1 text-xs text-red-600">
          {e}
        </p>
      ))}
    </div>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (state?.error) {
    return (
      <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {state.error}
      </div>
    );
  }
  if (state?.success) {
    return (
      <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
        {state.success}
      </div>
    );
  }
  return null;
}

/** Responsive two-column grid for form fields. */
export function FormGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2", className)}>{children}</div>;
}
