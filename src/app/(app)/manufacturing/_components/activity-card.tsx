import { Card, CardHeader } from "@/components/ui/card";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";

/** Audit trail for one record, newest first. */
export async function ActivityCard({ entityType, entityId, title = "Activity" }: { entityType: string; entityId: string; title?: string }) {
  const activity = await db.activity.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { user: { select: { name: true } } },
  });

  return (
    <Card>
      <CardHeader title={title} />
      <ul className="divide-y divide-line">
        {activity.length === 0 && <li className="px-5 py-8 text-center text-sm text-ink-faint">No activity yet.</li>}
        {activity.map((a) => (
          <li key={a.id} className="px-5 py-3">
            <p className="text-sm text-ink">{a.message}</p>
            <p className="mt-0.5 text-xs text-ink-faint">
              {a.user?.name ?? "System"} · {formatDateTime(a.createdAt)}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}
