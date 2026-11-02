import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList, StatCard } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatDateTime, formatNumber, num } from "@/lib/format";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/cn";
import { ActionForm } from "../../_components/action-form";
import { ActivityCard } from "../../_components/activity-card";
import { MfgStatusBadge, ModeBadge, PriorityBadge } from "../../_components/badges";
import { componentRequirement, operationHours, round3 } from "../../_lib/bom-math";
import { endOfLocalDay } from "../../_lib/scheduler";
import { toLocalDateParam } from "../../schedule/calendar";
import { availableByProduct, hasReservation, OPEN_BATCH_STATUSES, QC_DONE_BATCH_STATUSES, reservedRemaining } from "../../_lib/server";
import {
  autoScheduleOrder,
  cancelProductionOrder,
  closeOrderShort,
  createBatch,
  releaseComponents,
  reserveComponents,
  scheduleManually,
  unscheduleOrder,
} from "../actions";

export const metadata: Metadata = { title: "Production order" };

/** "YYYY-MM-DDTHH:mm" in local time for <input type="datetime-local">. */
function toDateTimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default async function ProductionOrderPage({ params }: PageProps<"/manufacturing/orders/[id]">) {
  const user = await requireUser("production");
  const { id } = await params;
  const order = await db.productionOrder.findUnique({
    where: { id },
    include: {
      product: { select: { id: true, sku: true, name: true, unit: true } },
      warehouse: { select: { id: true, code: true, name: true } },
      salesOrder: { select: { id: true, number: true, customer: { select: { name: true } } } },
      salesOrderLine: { select: { quantity: true, deliveredQty: true } },
      bom: {
        include: {
          lines: { orderBy: { position: "asc" }, include: { component: { select: { id: true, sku: true, name: true, unit: true, type: true } } } },
          operations: { orderBy: { sequence: "asc" }, include: { machine: { select: { id: true, code: true, name: true, status: true } } } },
        },
      },
      batches: { orderBy: { createdAt: "asc" } },
      scheduleSlots: { orderBy: { start: "asc" }, include: { machine: { select: { id: true, code: true, name: true } } } },
    },
  });
  if (!order) notFound();

  const qty = num(order.quantity);
  const produced = num(order.producedQty);
  const outputQty = num(order.bom.outputQty);
  const isOpen = order.status === "DRAFT" || order.status === "SCHEDULED" || order.status === "IN_PROGRESS";
  const consumedQty = order.batches.filter((b) => (QC_DONE_BATCH_STATUSES as readonly string[]).includes(b.status)).reduce((s, b) => s + num(b.quantity), 0);
  const openBatchQty = order.batches.filter((b) => (OPEN_BATCH_STATUSES as readonly string[]).includes(b.status)).reduce((s, b) => s + num(b.quantity), 0);
  const remainingToBatch = Math.max(0, round3(qty - produced - openBatchQty));

  const componentIds = [...new Set(order.bom.lines.map((l) => l.componentId))];
  const [available, reserved, consumedMoves] = await Promise.all([
    availableByProduct(order.warehouseId, componentIds),
    hasReservation(db, id),
    db.stockMovement.groupBy({
      by: ["productId"],
      where: { type: "PRODUCTION_OUT", referenceType: "ProductionBatch", referenceId: { in: order.batches.map((b) => b.id) } },
      _sum: { quantity: true },
    }),
  ]);
  const ownReserved = reserved ? reservedRemaining(order.bom, qty, consumedQty) : new Map<string, number>();
  const consumedBy = new Map(consumedMoves.map((m) => [m.productId, -num(m._sum.quantity)]));

  const requirements = order.bom.lines.map((l) => {
    const perUnit = componentRequirement(num(l.quantity), num(l.scrapPct), outputQty, 1);
    const required = componentRequirement(num(l.quantity), num(l.scrapPct), outputQty, qty);
    const stillNeeded = isOpen ? Math.max(0, round3(required - componentRequirement(num(l.quantity), num(l.scrapPct), outputQty, consumedQty))) : 0;
    const avail = round3((available.get(l.componentId) ?? 0) + (ownReserved.get(l.componentId) ?? 0));
    const shortfall = l.component.type === "SERVICE" ? 0 : Math.max(0, round3(stillNeeded - avail));
    return { line: l, perUnit, required, stillNeeded, avail, shortfall, consumed: consumedBy.get(l.componentId) ?? 0 };
  });
  const shortIds = [...new Set(requirements.filter((r) => r.shortfall > 0).map((r) => r.line.componentId))];
  const plannedHours = order.bom.operations.reduce((s, o) => s + operationHours(num(o.setupHours), num(o.runHoursPerUnit), qty), 0);
  const late = isOpen && order.dueDate && order.scheduledEnd && order.scheduledEnd > endOfLocalDay(order.dueDate);

  const canEdit = can(user, "production", "edit");
  const hasStartedBatch = order.batches.some((b) => b.status !== "PLANNED");
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0);
  const defaultEnd = new Date(defaultStart.getTime() + Math.max(1, Math.ceil(plannedHours)) * 3_600_000);

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {order.number} <MfgStatusBadge status={order.status} /> <ModeBadge mode={order.mode} />
            {late && <Badge tone="red">Finishes after due date</Badge>}
          </span>
        }
        description={`${order.product.name} · ${formatNumber(qty)} ${order.product.unit}`}
        back={{ href: "/manufacturing/orders", label: "Production orders" }}
        actions={
          canEdit && (
            <>
              {isOpen && !hasStartedBatch && (
                <ActionButton
                  action={cancelProductionOrder.bind(null, id)}
                  confirmMessage={`Cancel ${order.number}? Planned batches are deleted and reservations released.`}
                  pendingText="Cancelling…"
                >
                  Cancel order
                </ActionButton>
              )}
              {order.status === "SCHEDULED" && (
                <ActionButton action={unscheduleOrder.bind(null, id)} pendingText="Unscheduling…">
                  Unschedule
                </ActionButton>
              )}
              {order.status === "IN_PROGRESS" && (
                <ActionButton
                  action={closeOrderShort.bind(null, id)}
                  confirmMessage={`Close ${order.number} with ${formatNumber(produced)} of ${formatNumber(qty)} produced?`}
                  pendingText="Closing…"
                >
                  Close short
                </ActionButton>
              )}
              {isOpen && order.status !== "DRAFT" && !reserved && (
                <ActionButton action={reserveComponents.bind(null, id)} pendingText="Reserving…">
                  Reserve components
                </ActionButton>
              )}
              {isOpen && reserved && (
                <ActionButton action={releaseComponents.bind(null, id)} pendingText="Releasing…">
                  Release reservation
                </ActionButton>
              )}
              {order.status === "DRAFT" && <ButtonLink href={`/manufacturing/orders/${id}/edit`}>Edit</ButtonLink>}
            </>
          )
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Produced"
          value={`${formatNumber(produced)} / ${formatNumber(qty)}`}
          hint={`${order.product.unit} passed QC`}
          tone={order.status === "COMPLETED" && produced < qty ? "warning" : "default"}
        />
        <StatCard label="Due" value={formatDate(order.dueDate)} tone={isOpen && order.dueDate && order.dueDate < now ? "danger" : "default"} />
        <StatCard
          label="Scheduled"
          value={order.scheduledEnd ? formatDate(order.scheduledEnd) : "—"}
          hint={order.scheduledStart ? `from ${formatDateTime(order.scheduledStart)}` : "Not scheduled"}
          tone={late ? "danger" : "default"}
        />
        <StatCard label="Planned machine hours" value={formatNumber(plannedHours, 1)} hint={`${order.bom.operations.length} operations`} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DetailList
                items={[
                  {
                    label: "Product",
                    value: (
                      <Link href={`/inventory/products/${order.product.id}`} className="font-medium text-brand-700 hover:underline">
                        {order.product.sku} — {order.product.name}
                      </Link>
                    ),
                  },
                  {
                    label: "BOM",
                    value: can(user, "hubSettings") ? (
                      <Link href={`/manufacturing/hub/boms/${order.bomId}`} className="text-brand-700 hover:underline">
                        {order.bom.code} v{order.bom.version}
                      </Link>
                    ) : (
                      `${order.bom.code} v${order.bom.version}`
                    ),
                  },
                  { label: "Warehouse", value: `${order.warehouse.code} — ${order.warehouse.name}` },
                  { label: "Priority", value: <PriorityBadge priority={order.priority} /> },
                  {
                    label: "Sales order",
                    value: order.salesOrder ? (
                      <span>
                        <Link href={`/sales/orders/${order.salesOrder.id}`} className="text-brand-700 hover:underline">
                          {order.salesOrder.number}
                        </Link>{" "}
                        <span className="text-ink-soft">· {order.salesOrder.customer.name}</span>
                      </span>
                    ) : null,
                  },
                  { label: "Components", value: reserved ? <Badge tone="green">Reserved</Badge> : <span className="text-ink-soft">Not reserved</span> },
                  { label: "Notes", value: order.notes },
                ]}
              />
            </CardBody>
          </Card>

          {canEdit && order.status === "DRAFT" && (
            <Card>
              <CardHeader title="Schedule" description="Book machine time automatically, or set dates by hand." />
              <CardBody className="space-y-6">
                <ActionForm action={autoScheduleOrder.bind(null, id)} submitLabel="Auto-schedule" pendingText="Scheduling…">
                  <p className="text-xs text-ink-soft">
                    Places each operation on its machine at the earliest free time, respecting working days, shift start, machine hours and existing bookings.
                  </p>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="reserve" className="h-4 w-4 rounded border-line" /> Also reserve components
                  </label>
                </ActionForm>
                <ActionForm action={scheduleManually.bind(null, id)} submitLabel="Schedule manually" variant="secondary" pendingText="Saving…" className="border-t border-line pt-5">
                  <Field label="Start" htmlFor="scheduledStart">
                    <Input id="scheduledStart" name="scheduledStart" type="datetime-local" defaultValue={toDateTimeInput(defaultStart)} required />
                  </Field>
                  <Field label="End" htmlFor="scheduledEnd">
                    <Input id="scheduledEnd" name="scheduledEnd" type="datetime-local" defaultValue={toDateTimeInput(defaultEnd)} required />
                  </Field>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="reserve" className="h-4 w-4 rounded border-line" /> Also reserve components
                  </label>
                  <p className="text-xs text-ink-faint">Manual dates don&apos;t book machine slots.</p>
                </ActionForm>
              </CardBody>
            </Card>
          )}
          {canEdit && order.status === "SCHEDULED" && (
            <Card>
              <CardHeader title="Re-plan" />
              <CardBody>
                <ActionForm action={autoScheduleOrder.bind(null, id)} submitLabel="Auto-schedule again" variant="secondary" pendingText="Scheduling…">
                  <p className="text-xs text-ink-soft">Replaces this order&apos;s machine slots with the earliest free time from now.</p>
                </ActionForm>
              </CardBody>
            </Card>
          )}

          {canEdit && isOpen && remainingToBatch > 0 && (
            <Card>
              <CardHeader title="New batch" description={`${formatNumber(remainingToBatch)} ${order.product.unit} still to batch`} />
              <CardBody>
                <ActionForm action={createBatch.bind(null, id)} submitLabel="Plan batch" pendingText="Creating…">
                  <Field label="Batch quantity" htmlFor="batchQty">
                    <Input id="batchQty" name="quantity" type="number" min="0.001" max={remainingToBatch} step="any" defaultValue={remainingToBatch} required />
                  </Field>
                </ActionForm>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="Component requirements"
              description={`From ${order.warehouse.code}. Required = BOM qty × ${formatNumber(qty)} ÷ ${formatNumber(outputQty)} × (1 + scrap). Available = in hand − reserved${reserved ? " (plus this order's own reservation)" : ""}.`}
              actions={
                isOpen &&
                shortIds.length > 0 &&
                can(user, "purchaseOrders", "edit") && (
                  <ButtonLink href={`/purchasing/orders/new?productIds=${shortIds.join(",")}`} size="sm">
                    Procure shortfall
                  </ButtonLink>
                )
              }
            />
            <Table>
              <THead>
                <tr>
                  <TH>Component</TH>
                  <TH align="right">Per unit</TH>
                  <TH align="right">Required</TH>
                  <TH align="right">Consumed</TH>
                  <TH align="right">Still needed</TH>
                  <TH align="right">Available</TH>
                  <TH align="right">Shortfall</TH>
                </tr>
              </THead>
              <TBody>
                {requirements.length === 0 && <EmptyRow colSpan={7}>The BOM has no components.</EmptyRow>}
                {requirements.map((r) => (
                  <TR key={r.line.id} className={r.shortfall > 0 ? "bg-red-50/60" : undefined}>
                    <TD>
                      <Link href={`/inventory/products/${r.line.component.id}`} className="font-medium text-brand-700 hover:underline">
                        {r.line.component.name}
                      </Link>
                      <div className="font-mono text-xs text-ink-faint">
                        {r.line.component.sku}
                        {num(r.line.scrapPct) > 0 && ` · scrap ${formatNumber(r.line.scrapPct, 2)}%`}
                      </div>
                    </TD>
                    <TD align="right">{formatNumber(r.perUnit, 4)}</TD>
                    <TD align="right">
                      {formatNumber(r.required)} <span className="text-xs text-ink-faint">{r.line.component.unit}</span>
                    </TD>
                    <TD align="right" className="text-ink-soft">
                      {formatNumber(r.consumed)}
                    </TD>
                    <TD align="right">{formatNumber(r.stillNeeded)}</TD>
                    <TD align="right" className={r.shortfall > 0 ? "text-red-700" : "text-emerald-700"}>
                      {formatNumber(r.avail)}
                    </TD>
                    <TD align="right" className={cn(r.shortfall > 0 && "font-semibold text-red-700")}>
                      {r.shortfall > 0 ? formatNumber(r.shortfall) : "—"}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>

          <Card>
            <CardHeader title="Operations" description={`Planned hours for ${formatNumber(qty)} ${order.product.unit}`} />
            <Table>
              <THead>
                <tr>
                  <TH>Seq</TH>
                  <TH>Operation</TH>
                  <TH>Machine</TH>
                  <TH align="right">Setup h</TH>
                  <TH align="right">Run h</TH>
                  <TH align="right">Planned h</TH>
                </tr>
              </THead>
              <TBody>
                {order.bom.operations.length === 0 && <EmptyRow colSpan={6}>No operations on this BOM.</EmptyRow>}
                {order.bom.operations.map((o) => (
                  <TR key={o.id}>
                    <TD className="tabular-nums">{o.sequence}</TD>
                    <TD>{o.name}</TD>
                    <TD>
                      {o.machine ? (
                        <span className="flex items-center gap-2">
                          {o.machine.code} <span className="text-ink-soft">{o.machine.name}</span>
                          {o.machine.status !== "ACTIVE" && <MfgStatusBadge status={o.machine.status} />}
                        </span>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </TD>
                    <TD align="right">{formatNumber(o.setupHours, 2)}</TD>
                    <TD align="right">{formatNumber(num(o.runHoursPerUnit) * qty, 2)}</TD>
                    <TD align="right">{formatNumber(operationHours(num(o.setupHours), num(o.runHoursPerUnit), qty), 2)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>

          <Card>
            <CardHeader title="Batches" description={`${formatNumber(openBatchQty)} in open batches · ${formatNumber(remainingToBatch)} still to batch`} />
            <Table>
              <THead>
                <tr>
                  <TH>Batch</TH>
                  <TH align="right">Qty</TH>
                  <TH align="right">Passed</TH>
                  <TH align="right">Failed</TH>
                  <TH>Started</TH>
                  <TH>QC</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {order.batches.length === 0 && <EmptyRow colSpan={7}>No batches yet.</EmptyRow>}
                {order.batches.map((b) => (
                  <TR key={b.id}>
                    <TD>
                      <Link href={`/manufacturing/batches/${b.id}`} className="font-medium text-brand-700 hover:underline">
                        {b.number}
                      </Link>
                    </TD>
                    <TD align="right">{formatNumber(b.quantity)}</TD>
                    <TD align="right" className="text-emerald-700">
                      {formatNumber(b.passedQty)}
                    </TD>
                    <TD align="right" className={num(b.failedQty) > 0 ? "text-red-700" : "text-ink-faint"}>
                      {formatNumber(b.failedQty)}
                    </TD>
                    <TD className="text-ink-soft">{formatDateTime(b.startedAt)}</TD>
                    <TD className="text-ink-soft">{formatDateTime(b.qcAt)}</TD>
                    <TD>
                      <MfgStatusBadge status={b.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>

          <Card>
            <CardHeader
              title="Schedule slots"
              actions={
                <ButtonLink href={`/manufacturing/schedule${order.scheduledStart ? `?date=${toLocalDateParam(order.scheduledStart)}` : ""}`} variant="secondary" size="sm">
                  View on calendar
                </ButtonLink>
              }
            />
            <Table>
              <THead>
                <tr>
                  <TH>Machine</TH>
                  <TH>Operation</TH>
                  <TH>Start</TH>
                  <TH>End</TH>
                  <TH align="right">Hours</TH>
                </tr>
              </THead>
              <TBody>
                {order.scheduleSlots.length === 0 && <EmptyRow colSpan={5}>No machine time booked.</EmptyRow>}
                {order.scheduleSlots.map((s) => (
                  <TR key={s.id}>
                    <TD>
                      {can(user, "hubSettings") ? (
                        <Link href={`/manufacturing/hub/machines/${s.machine.id}`} className="text-brand-700 hover:underline">
                          {s.machine.code}
                        </Link>
                      ) : (
                        s.machine.code
                      )}
                    </TD>
                    <TD>{s.operationName}</TD>
                    <TD className="whitespace-nowrap">{formatDateTime(s.start)}</TD>
                    <TD className="whitespace-nowrap text-ink-soft">{formatDateTime(s.end)}</TD>
                    <TD align="right">{formatNumber((s.end.getTime() - s.start.getTime()) / 3_600_000, 2)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>

          <ActivityCard entityType="ProductionOrder" entityId={id} />
        </div>
      </div>
    </>
  );
}
