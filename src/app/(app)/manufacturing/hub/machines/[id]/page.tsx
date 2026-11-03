import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList, StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime, formatMoney, formatNumber, num } from "@/lib/format";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/cn";
import { ActivityCard } from "../../../_components/activity-card";
import { MfgStatusBadge } from "../../../_components/badges";
import { dailyLoad, toSchedulerMachine, utilisationPct } from "../../../_lib/capacity";
import { deleteMachine } from "../../actions";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Machine" };

const DAYS = 14;
const dayLabel = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "2-digit", month: "short" });

export default async function MachinePage({ params }: PageProps<"/manufacturing/hub/machines/[id]">) {
  const user = await requireUser("hubSettings");
  const { id } = await params;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const until = new Date(today.getFullYear(), today.getMonth(), today.getDate() + DAYS);

  const machine = await db.machine.findUnique({
    where: { id },
    include: {
      productionUnit: true,
      operations: { include: { bom: { select: { id: true, code: true, version: true, product: { select: { name: true } } } } } },
    },
  });
  if (!machine) notFound();

  const [windowSlots, upcoming] = await Promise.all([
    db.productionScheduleSlot.findMany({ where: { machineId: id, end: { gt: today }, start: { lt: until } }, select: { start: true, end: true } }),
    db.productionScheduleSlot.findMany({
      where: { machineId: id, end: { gt: now } },
      orderBy: { start: "asc" },
      take: 50,
      include: { productionOrder: { select: { id: true, number: true, status: true, product: { select: { name: true } } } } },
    }),
  ]);

  const load = dailyLoad(toSchedulerMachine(machine), windowSlots, today, DAYS);
  const pct = utilisationPct(load);
  const booked = load.reduce((s, d) => s + d.bookedHours, 0);
  const available = load.reduce((s, d) => s + d.availableHours, 0);
  const canEdit = can(user, "hubSettings", "edit");

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {machine.name} <MfgStatusBadge status={machine.status} />
          </span>
        }
        description={`${machine.code} · ${machine.productionUnit.name}`}
        back={{ href: "/manufacturing/hub/machines", label: "Machines" }}
        actions={
          <>
            {can(user, "production") && (
              <ButtonLink href="/manufacturing/schedule" variant="secondary">
                Open schedule
              </ButtonLink>
            )}
            {canEdit && machine.operations.length === 0 && upcoming.length === 0 && (
              <ActionButton action={deleteMachine.bind(null, id)} confirmMessage={`Delete ${machine.code}?`} pendingText="Deleting…">
                Delete
              </ActionButton>
            )}
            {canEdit && <ButtonLink href={`/manufacturing/hub/machines/${id}/edit`}>Edit</ButtonLink>}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={`Utilisation, next ${DAYS} days`} value={`${pct}%`} tone={pct > 90 ? "danger" : pct > 70 ? "warning" : "default"} />
        <StatCard label="Booked hours" value={formatNumber(booked, 1)} hint={`of ${formatNumber(available, 1)} available`} />
        <StatCard label="Upcoming slots" value={upcoming.length} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DetailList
                items={[
                  {
                    label: "Production unit",
                    value: (
                      <Link href={`/manufacturing/hub/units/${machine.productionUnit.id}`} className="text-brand-700 hover:underline">
                        {machine.productionUnit.name}
                      </Link>
                    ),
                  },
                  { label: "Type", value: machine.type },
                  { label: "Hours per day", value: formatNumber(machine.hoursPerDay, 2) },
                  { label: "Day starts", value: machine.productionUnit.shiftStart },
                  { label: "Hourly cost", value: formatMoney(machine.hourlyCost) },
                  { label: "Notes", value: machine.notes },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Used in BOM operations" />
            <ul className="divide-y divide-line">
              {machine.operations.length === 0 && <li className="px-5 py-6 text-center text-sm text-ink-faint">Not used by any BOM.</li>}
              {machine.operations.map((op) => (
                <li key={op.id} className="px-5 py-2.5 text-sm">
                  <Link href={`/manufacturing/hub/boms/${op.bom.id}`} className="font-medium text-brand-700 hover:underline">
                    {op.bom.code} v{op.bom.version}
                  </Link>{" "}
                  <span className="text-ink-soft">
                    {op.bom.product.name} · {op.name}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Daily load" description="Booked hours against the machine's available hours per day." />
            <CardBody>
              <ul className="space-y-1.5">
                {load.map((d) => {
                  const ratio = d.availableHours > 0 ? d.bookedHours / d.availableHours : d.bookedHours > 0 ? 1 : 0;
                  return (
                    <li key={d.date.toISOString()} className="flex items-center gap-3 text-xs">
                      <span className="w-24 shrink-0 text-ink-soft">{dayLabel.format(d.date)}</span>
                      <span className="relative h-3 flex-1 overflow-hidden rounded bg-muted">
                        {d.availableHours > 0 && (
                          <span
                            className={cn("absolute inset-y-0 left-0", ratio > 0.9 ? "bg-red-500" : ratio > 0.7 ? "bg-amber-500" : "bg-brand-500")}
                            style={{ width: `${Math.min(100, ratio * 100)}%` }}
                          />
                        )}
                      </span>
                      <span className="w-24 shrink-0 text-right tabular-nums text-ink-soft">
                        {d.availableHours > 0 ? `${formatNumber(d.bookedHours, 1)} / ${formatNumber(d.availableHours, 1)} h` : "Off"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Upcoming schedule" />
            <Table>
              <THead>
                <tr>
                  <TH>Start</TH>
                  <TH>End</TH>
                  <TH align="right">Hours</TH>
                  <TH>Order</TH>
                  <TH>Operation</TH>
                </tr>
              </THead>
              <TBody>
                {upcoming.length === 0 && <EmptyRow colSpan={5}>Nothing scheduled.</EmptyRow>}
                {upcoming.map((s) => (
                  <TR key={s.id}>
                    <TD className="whitespace-nowrap">{formatDateTime(s.start)}</TD>
                    <TD className="whitespace-nowrap text-ink-soft">{formatDateTime(s.end)}</TD>
                    <TD align="right">{formatNumber(num((s.end.getTime() - s.start.getTime()) / 3_600_000), 2)}</TD>
                    <TD>
                      <Link href={`/manufacturing/orders/${s.productionOrder.id}`} className="font-medium text-brand-700 hover:underline">
                        {s.productionOrder.number}
                      </Link>
                      <div className="text-xs text-ink-faint">{s.productionOrder.product.name}</div>
                    </TD>
                    <TD>{s.operationName}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <ActivityCard entityType="Machine" entityId={id} />
        </div>
      </div>
    </>
  );
}
