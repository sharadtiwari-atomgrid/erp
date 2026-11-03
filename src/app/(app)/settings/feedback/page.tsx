import Link from "next/link";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { FEEDBACK_STATUSES } from "@/components/feedback/options";
import type { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { param } from "@/lib/forms";
import { can } from "@/lib/permissions";
import { fileUrl } from "@/lib/storage";
import { FeedbackEditor } from "./feedback-editor";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Bugs & requests" };

const STATUS_TONE = { New: "blue", "In progress": "amber", Done: "green", "Won't do": "gray" } as const;
const PRIORITY_TONE = { "Blocking my work": "red", Annoying: "amber", Minor: "gray" } as const;

export default async function FeedbackPage({ searchParams }: PageProps<"/settings/feedback">) {
  // Everyone can open this page: people with settings access see every report, others only their own.
  const user = await requireUser();
  const sp = await searchParams;
  const kind = param(sp, "kind");
  const status = param(sp, "status");
  const seeAll = can(user, "settings");
  const canEdit = can(user, "settings", "edit");

  const where: Prisma.FeedbackWhereInput = {
    ...(!seeAll && { userId: user.id }),
    ...((kind === "BUG" || kind === "FEATURE") && { kind }),
    ...((FEEDBACK_STATUSES as readonly string[]).includes(status) && { status }),
  };
  const items = await db.feedback.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { user: { select: { name: true } } },
  });
  const shots = items.length
    ? await db.opsFile.findMany({ where: { entityType: "Feedback", entityId: { in: items.map((i) => i.id) } }, orderBy: { createdAt: "asc" } })
    : [];
  const shotsBy = new Map<string, typeof shots>();
  for (const s of shots) shotsBy.set(s.entityId, [...(shotsBy.get(s.entityId) ?? []), s]);

  const chip = (href: string, label: string, on: boolean) => (
    <Link
      key={href}
      href={href}
      className={cn(
        "rounded-full px-3 py-1 text-sm",
        on ? "bg-ink font-medium text-white" : "border border-line bg-surface text-ink-soft hover:text-ink",
      )}
    >
      {label}
    </Link>
  );
  const qs = (k: string, s: string) => {
    const p = new URLSearchParams();
    if (k) p.set("kind", k);
    if (s) p.set("status", s);
    const t = p.toString();
    return `/settings/feedback${t ? `?${t}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title={seeAll ? "Bugs & requests" : "My bugs & requests"}
        description={
          seeAll
            ? "Every bug report and feature request sent from the header. Set the status and reply; the person who sent it sees your reply here."
            : "The bug reports and feature requests you've sent, with their status and any reply. Use the buttons in the header to send a new one."
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {chip(qs("", status), "All", !kind)}
        {chip(qs("BUG", status), "🐞 Bugs", kind === "BUG")}
        {chip(qs("FEATURE", status), "💡 Feature requests", kind === "FEATURE")}
        <span className="mx-1 w-px bg-line" />
        {chip(qs(kind, ""), "Any status", !status)}
        {FEEDBACK_STATUSES.map((s) => chip(qs(kind, s), s, status === s))}
      </div>

      {items.length === 0 ? (
        <Card className="px-5 py-10 text-center text-sm text-ink-faint">Nothing here yet.</Card>
      ) : (
        <div className="space-y-3">
          {items.map((f) => (
            <Card key={f.id} className="px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold text-ink">
                    {f.kind === "BUG" ? "🐞" : "💡"} {f.title}
                  </h2>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    {seeAll && <>{f.user?.name ?? "Unknown user"} · </>}
                    {formatDateTime(f.createdAt)}
                    {f.page && <> · {f.page}</>}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {f.priority && <Badge tone={PRIORITY_TONE[f.priority as keyof typeof PRIORITY_TONE] ?? "gray"}>{f.priority}</Badge>}
                  <Badge tone={STATUS_TONE[f.status as keyof typeof STATUS_TONE] ?? "gray"}>{f.status}</Badge>
                </div>
              </div>
              {f.details && <p className="mt-2 text-sm whitespace-pre-line text-ink">{f.details}</p>}
              {(shotsBy.get(f.id) ?? []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {(shotsBy.get(f.id) ?? []).map((s) =>
                    s.storageKey ? (
                      <a key={s.id} href={fileUrl(s.storageKey)} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-700 hover:underline">
                        📎 {s.fileName}
                      </a>
                    ) : null,
                  )}
                </div>
              )}
              {canEdit ? (
                <FeedbackEditor id={f.id} status={f.status} reply={f.reply ?? ""} />
              ) : (
                f.reply && (
                  <div className="mt-3 rounded-md border border-line bg-muted/40 px-3 py-2 text-sm">
                    <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Reply</span>
                    <p className="mt-0.5 whitespace-pre-line text-ink">{f.reply}</p>
                  </div>
                )
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
