"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Select } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatDateTime, formatDate } from "@/lib/format";
import { autoScheduleAll, type AutoScheduleState } from "./actions";

/** The "Auto-schedule" button plus a summary of what it did. */
export function AutoScheduleForm() {
  const [state, formAction] = useActionState<AutoScheduleState, FormData>(autoScheduleAll, undefined);
  const r = state?.result;
  return (
    <div className="flex flex-col items-end gap-2">
      <form action={formAction} className="flex items-center gap-2">
        <Select name="scope" defaultValue="all" className="w-auto" aria-label="Which orders">
          <option value="all">Draft + scheduled orders</option>
          <option value="draft">Draft orders only</option>
        </Select>
        <SubmitButton pendingText="Scheduling…">Auto-schedule</SubmitButton>
      </form>
      {state?.error && (
        <p role="alert" className="max-w-md text-right text-xs text-red-600">
          {state.error}
        </p>
      )}
      {r && (
        <div role="status" className="w-full max-w-md rounded-md border border-line bg-surface p-3 text-xs shadow-sm">
          <p className="font-medium text-ink">
            {r.scheduled === 0 ? "Nothing to schedule." : `Scheduled ${r.scheduled} order${r.scheduled === 1 ? "" : "s"}.`}
          </p>
          {r.late.length > 0 && (
            <div className="mt-2">
              <p className="font-medium text-red-700">Finishing after their due date:</p>
              <ul className="mt-1 space-y-0.5">
                {r.late.map((l) => (
                  <li key={l.id}>
                    <Link href={`/manufacturing/orders/${l.id}`} className="text-brand-700 hover:underline">
                      {l.number}
                    </Link>{" "}
                    ends {formatDateTime(l.end)}, due {formatDate(l.dueDate)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.unscheduled.length > 0 && (
            <div className="mt-2">
              <p className="font-medium text-amber-700">Could not schedule:</p>
              <ul className="mt-1 space-y-0.5">
                {r.unscheduled.map((u) => (
                  <li key={u.id}>
                    <Link href={`/manufacturing/orders/${u.id}`} className="text-brand-700 hover:underline">
                      {u.number}
                    </Link>{" "}
                    <span className="text-ink-soft">{u.reason.replace(`${u.number}: `, "")}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.warnings.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-ink-soft">
              {r.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
