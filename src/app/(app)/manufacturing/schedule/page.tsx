import Link from "next/link";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { branchWhere } from "@/lib/branch";
import { db } from "@/lib/db";
import { formatDate, formatNumber } from "@/lib/format";
import { param } from "@/lib/forms";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/cn";
import { MfgStatusBadge, PriorityBadge } from "../_components/badges";
import { toSchedulerMachine } from "../_lib/capacity";
import { endOfLocalDay, workingWindow } from "../_lib/scheduler";
import { AutoScheduleForm } from "./auto-schedule-form";
import { calendarRange, orderColor, parseLocalDate, placement, toLocalDateParam, type View } from "./calendar";

export const metadata: Metadata = { title: "Production schedule" };

const VIEWS: View[] = ["day", "week", "month"];
const timeFmt = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" });
const dayTimeFmt = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function SchedulePage({ searchParams }: PageProps<"/manufacturing/schedule">) {
  const user = await requireUser("production");
  const sp = await searchParams;
  const view: View = (VIEWS as string[]).includes(param(sp, "view")) ? (param(sp, "view") as View) : "week";
  const now = new Date();
  const range = calendarRange(view, parseLocalDate(param(sp, "date"), now));
  const scope = await branchWhere();

  const [machines, queue] = await Promise.all([
    db.machine.findMany({
      where: { productionUnit: scope },
      orderBy: [{ productionUnit: { name: "asc" } }, { code: "asc" }],
      include: {
        productionUnit: { select: { id: true, name: true, shiftStart: true, workingDays: true, isActive: true } },
        scheduleSlots: {
          where: { start: { lt: range.end }, end: { gt: range.start } },
          orderBy: { start: "asc" },
          include: {
            productionOrder: {
              select: { id: true, number: true, status: true, dueDate: true, scheduledEnd: true, product: { select: { name: true } } },
            },
          },
        },
      },
    }),
    db.productionOrder.findMany({
      where: { ...scope, status: "DRAFT" },
      orderBy: [{ priority: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }],
      take: 20,
      select: { id: true, number: true, priority: true, dueDate: true, quantity: true, product: { select: { name: true, unit: true } } },
    }),
  ]);

  // Orders visible in this range, for the legend.
  const legend = new Map<string, { id: string; number: string; product: string; status: string; dueDate: Date | null; late: boolean }>();
  for (const m of machines) {
    for (const s of m.scheduleSlots) {
      const o = s.productionOrder;
      const late = Boolean(o.dueDate && o.scheduledEnd && o.scheduledEnd > endOfLocalDay(o.dueDate) && o.status !== "COMPLETED" && o.status !== "CANCELLED");
      legend.set(o.id, { id: o.id, number: o.number, product: o.product.name, status: o.status, dueDate: o.dueDate, late });
    }
  }

  const href = (overrides: { view?: View; date?: Date }) =>
    `/manufacturing/schedule?view=${overrides.view ?? view}&date=${toLocalDateParam(overrides.date ?? range.start)}`;
  const nowPos = placement(range, now, new Date(now.getTime() + 1));
  const minWidth = view === "month" ? "min-w-[1400px]" : view === "week" ? "min-w-[980px]" : "min-w-[1100px]";
  const columnLabel = (d: Date) =>
    view === "day"
      ? d.getHours() % 2 === 0
        ? timeFmt.format(d)
        : ""
      : view === "week"
        ? new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short" }).format(d)
        : String(d.getDate());
  const today = toLocalDateParam(now);

  return (
    <>
      <PageHeader
        title="Production schedule"
        description="Machine lanes with booked operation slots, coloured per production order. Grey areas are outside working hours."
        actions={can(user, "production", "edit") && <AutoScheduleForm />}
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <Link href={href({ date: now })} className={buttonClass("secondary", "sm")}>
              Today
            </Link>
            <Link href={href({ date: range.prev })} className={buttonClass("ghost", "sm")} aria-label="Previous">
              ‹
            </Link>
            <Link href={href({ date: range.next })} className={buttonClass("ghost", "sm")} aria-label="Next">
              ›
            </Link>
            <h2 className="ml-2 text-sm font-semibold text-ink">{range.label}</h2>
          </div>
          <div className="inline-flex rounded-md border border-line p-0.5 text-xs">
            {VIEWS.map((v) => (
              <Link
                key={v}
                href={href({ view: v, date: range.start })}
                className={cn("rounded px-3 py-1 font-medium capitalize", v === view ? "bg-ink text-white" : "text-ink-soft hover:text-ink")}
              >
                {v}
              </Link>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className={cn("relative", minWidth)}>
            {/* Column header */}
            <div className="flex border-b border-line bg-muted/60 text-xs text-ink-soft">
              <div className="w-44 shrink-0 px-3 py-2 font-semibold uppercase tracking-wide">Machine</div>
              <div className="relative flex flex-1">
                {range.columns.map((c) => {
                  const isToday = view !== "day" && toLocalDateParam(c) === today;
                  return (
                    <div key={c.getTime()} className={cn("flex-1 border-l border-line px-1 py-2 text-center whitespace-nowrap", isToday && "font-semibold text-brand-700")}>
                      {view === "day" ? (
                        columnLabel(c)
                      ) : (
                        <Link href={href({ view: "day", date: c })} className="hover:underline">
                          {columnLabel(c)}
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {machines.length === 0 && <p className="px-4 py-10 text-center text-sm text-ink-faint">No machines in this branch. Add them in Hub settings.</p>}

            {machines.map((m, i) => {
              const sm = toSchedulerMachine(m);
              const windows: Array<{ left: number; width: number }> = [];
              for (let d = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate() - 1); d < range.end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
                const w = workingWindow(sm, d);
                const p = w && placement(range, new Date(w.start), new Date(w.end));
                if (p) windows.push(p);
              }
              const newUnit = i === 0 || machines[i - 1].productionUnit.id !== m.productionUnit.id;
              return (
                <div key={m.id}>
                  {newUnit && (
                    <div className="border-b border-line bg-surface px-3 py-1.5 text-xs font-semibold text-ink-soft">{m.productionUnit.name}</div>
                  )}
                  <div className="flex border-b border-line">
                    <div className="w-44 shrink-0 px-3 py-2">
                      <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
                        {can(user, "hubSettings") ? (
                          <Link href={`/manufacturing/hub/machines/${m.id}`} className="hover:underline">
                            {m.code}
                          </Link>
                        ) : (
                          m.code
                        )}
                        {m.status !== "ACTIVE" && <MfgStatusBadge status={m.status} />}
                      </div>
                      <div className="truncate text-xs text-ink-faint">
                        {m.name} · {formatNumber(m.hoursPerDay, 1)}h/day
                      </div>
                    </div>
                    <div className={cn("relative h-14 flex-1", m.status === "ACTIVE" ? "bg-slate-100" : "bg-slate-200/70")}>
                      {windows.map((w, k) => (
                        <div key={k} className="absolute inset-y-0 bg-surface" style={{ left: `${w.left}%`, width: `${w.width}%` }} />
                      ))}
                      {range.columns.map((c, k) =>
                        k === 0 ? null : (
                          <div
                            key={c.getTime()}
                            className="absolute inset-y-0 border-l border-line/70"
                            style={{ left: `${(k / range.columns.length) * 100}%` }}
                          />
                        ),
                      )}
                      {m.scheduleSlots.map((s) => {
                        const p = placement(range, s.start, s.end);
                        if (!p) return null;
                        const late = legend.get(s.productionOrder.id)?.late;
                        return (
                          <Link
                            key={s.id}
                            href={`/manufacturing/orders/${s.productionOrder.id}`}
                            title={`${s.productionOrder.number} · ${s.operationName}\n${s.productionOrder.product.name}\n${dayTimeFmt.format(s.start)} → ${dayTimeFmt.format(s.end)}`}
                            className={cn(
                              "absolute top-1.5 bottom-1.5 overflow-hidden rounded border-l-4 px-1.5 py-0.5 text-[11px] leading-tight shadow-sm hover:z-10 hover:ring-2 hover:ring-ink/30",
                              orderColor(s.productionOrder.id),
                              late && "ring-2 ring-red-500",
                              s.productionOrder.status === "COMPLETED" && "opacity-50",
                            )}
                            style={{ left: `${p.left}%`, width: `max(${p.width}%, 4px)` }}
                          >
                            <span className="block truncate font-semibold">{s.productionOrder.number}</span>
                            <span className="block truncate opacity-90">{s.operationName}</span>
                          </Link>
                        );
                      })}
                      {nowPos && <div className="absolute inset-y-0 z-20 w-px bg-red-500" style={{ left: `${nowPos.left}%` }} aria-hidden />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Orders in view" description="Red outline = finishes after its due date." />
          <ul className="divide-y divide-line">
            {legend.size === 0 && <li className="px-5 py-8 text-center text-sm text-ink-faint">Nothing booked in this period.</li>}
            {[...legend.values()].map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={cn("h-3 w-3 shrink-0 rounded-sm border-l-4", orderColor(o.id))} aria-hidden />
                  <Link href={`/manufacturing/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">
                    {o.number}
                  </Link>
                  <span className="truncate text-ink-soft">{o.product}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-ink-soft">
                  due {formatDate(o.dueDate)}
                  {o.late && <Badge tone="red">Late</Badge>}
                  <MfgStatusBadge status={o.status} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Waiting to be scheduled" description="Draft orders, highest priority first." />
          <ul className="divide-y divide-line">
            {queue.length === 0 && <li className="px-5 py-8 text-center text-sm text-ink-faint">No draft orders.</li>}
            {queue.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <PriorityBadge priority={o.priority} />
                  <Link href={`/manufacturing/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">
                    {o.number}
                  </Link>
                  <span className="truncate text-ink-soft">
                    {o.product.name} · {formatNumber(o.quantity)} {o.product.unit}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-ink-soft">due {formatDate(o.dueDate)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
