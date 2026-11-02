import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("min-w-full divide-y divide-line text-sm", className)}>{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-muted/60">{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-line bg-surface">{children}</tbody>;
}

export function TH({ className, align = "left", ...props }: ComponentProps<"th"> & { align?: "left" | "right" | "center" }) {
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-soft whitespace-nowrap",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, align = "left", ...props }: ComponentProps<"td"> & { align?: "left" | "right" | "center" }) {
  return (
    <td
      className={cn(
        "px-4 py-2.5 text-ink",
        align === "right" ? "text-right tabular-nums" : align === "center" ? "text-center" : "text-left",
        className,
      )}
      {...props}
    />
  );
}

export function TR({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("hover:bg-muted/40", className)} {...props} />;
}

export function EmptyRow({ colSpan, children = "No records found." }: { colSpan: number; children?: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-ink-faint">
        {children}
      </td>
    </tr>
  );
}
