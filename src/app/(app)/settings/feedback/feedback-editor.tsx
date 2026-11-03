"use client";

import { useState, useTransition } from "react";
import { updateFeedback } from "@/components/feedback/actions";
import { FEEDBACK_STATUSES } from "@/components/feedback/options";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/form";

/** Status and reply for one report (people who manage settings). */
export function FeedbackEditor({ id, status, reply }: { id: string; status: string; reply: string }) {
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-[180px_1fr_auto] sm:items-start"
      action={(fd) =>
        start(async () => {
          const res = await updateFeedback(id, fd);
          setMessage(res.ok ? "Saved." : res.error);
        })
      }
    >
      <Select name="status" defaultValue={status} aria-label="Status">
        {FEEDBACK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>
      <Textarea name="reply" rows={2} defaultValue={reply} placeholder="Reply to the person who sent it" aria-label="Reply" />
      <div className="flex flex-col items-end gap-1">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {message && <span className="text-xs text-ink-soft">{message}</span>}
      </div>
    </form>
  );
}
