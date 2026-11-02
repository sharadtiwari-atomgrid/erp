import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClass } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";

/**
 * GET form for list pages: a search box plus optional status filter.
 * Works without JavaScript; values arrive in the page's searchParams.
 */
export function ListToolbar({
  q,
  placeholder = "Search…",
  filter,
  children,
}: {
  q?: string;
  placeholder?: string;
  filter?: { name: string; value: string; options: Array<{ value: string; label: string }>; allLabel?: string };
  children?: ReactNode;
}) {
  return (
    <form className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3" role="search">
      <Input name="q" defaultValue={q} placeholder={placeholder} className="max-w-xs" aria-label="Search" />
      {filter && (
        <Select name={filter.name} defaultValue={filter.value} className="w-auto" aria-label="Filter">
          <option value="">{filter.allLabel ?? "All"}</option>
          {filter.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      )}
      {children}
      <button type="submit" className={buttonClass("secondary")}>
        Apply
      </button>
    </form>
  );
}

/** Previous/next pagination that preserves the other search params. */
export function Pagination({
  page,
  pageSize,
  total,
  searchParams,
}: {
  page: number;
  pageSize: number;
  total: number;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) {
      if (k !== "page" && typeof v === "string" && v) sp.set(k, v);
    }
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return s ? `?${s}` : "?";
  };
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-3 text-xs text-ink-soft">
      <span>
        {from}–{to} of {total}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={buttonClass("secondary", "sm")}>
            Previous
          </Link>
        ) : (
          <span className={buttonClass("secondary", "sm", "opacity-50")}>Previous</span>
        )}
        {page < pages ? (
          <Link href={href(page + 1)} className={buttonClass("secondary", "sm")}>
            Next
          </Link>
        ) : (
          <span className={buttonClass("secondary", "sm", "opacity-50")}>Next</span>
        )}
      </div>
    </div>
  );
}
