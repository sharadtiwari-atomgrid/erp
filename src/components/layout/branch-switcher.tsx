"use client";

import { useRef } from "react";
import { selectBranch } from "@/components/layout/branch-actions";

export function BranchSwitcher({
  branches,
  value,
  locked,
}: {
  branches: Array<{ id: string; code: string; name: string }>;
  value: string;
  locked: boolean;
}) {
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={selectBranch} className="flex items-center gap-2">
      <label htmlFor="branch-switcher" className="hidden text-xs font-medium text-ink-faint sm:block">
        Branch
      </label>
      <select
        id="branch-switcher"
        name="branchId"
        defaultValue={value}
        disabled={locked}
        onChange={() => form.current?.requestSubmit()}
        className="h-8 rounded-md border border-line bg-surface px-2 pr-7 text-sm text-ink disabled:bg-muted"
      >
        {!locked && <option value="">All branches</option>}
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.code} · {b.name}
          </option>
        ))}
      </select>
    </form>
  );
}
