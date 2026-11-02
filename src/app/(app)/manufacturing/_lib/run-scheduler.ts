import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { num } from "@/lib/format";
import { toSchedulerMachine } from "./capacity";
import { autoSchedule, type ScheduleResult, type SchedulerOrder, type SchedulerSlot } from "./scheduler";
import { MfgError } from "./server";

/** Arbitrary constant: serialises auto-schedule runs so two clicks can't interleave. */
const SCHEDULER_LOCK = 7_310_001;

export type AutoScheduleSummary = {
  scheduled: number;
  late: Array<{ id: string; number: string; end: Date; dueDate: Date }>;
  unscheduled: Array<{ id: string; number: string; reason: string }>;
  warnings: string[];
};

/**
 * Loads DRAFT/SCHEDULED orders, runs the pure scheduler against the current
 * calendar and writes the result: slots, scheduledStart/End and status
 * SCHEDULED. Orders that can't be placed keep whatever schedule they had.
 */
export async function runAutoSchedule(opts: {
  userId: string;
  /** Limit to these orders (e.g. one order's "Auto-schedule" button). */
  orderIds?: string[];
  /** "draft" = only orders without a schedule yet; "all" = also re-plan SCHEDULED orders. */
  scope?: "all" | "draft";
  branch?: { branchId?: string };
}): Promise<AutoScheduleSummary> {
  const now = new Date();
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SCHEDULER_LOCK})`;

      const where: Prisma.ProductionOrderWhereInput = {
        status: { in: opts.scope === "draft" ? ["DRAFT"] : ["DRAFT", "SCHEDULED"] },
        ...(opts.orderIds && { id: { in: opts.orderIds } }),
        ...opts.branch,
      };
      const candidates = await tx.productionOrder.findMany({
        where,
        select: {
          id: true,
          number: true,
          priority: true,
          dueDate: true,
          createdAt: true,
          quantity: true,
          producedQty: true,
          updatedAt: true,
          bom: { select: { operations: true } },
        },
      });
      if (candidates.length === 0) return { scheduled: 0, late: [], unscheduled: [], warnings: [] };

      const [machines, slots] = await Promise.all([
        tx.machine.findMany({ include: { productionUnit: { select: { shiftStart: true, workingDays: true, isActive: true } } } }),
        tx.productionScheduleSlot.findMany({ where: { end: { gt: now } }, select: { productionOrderId: true, machineId: true, start: true, end: true } }),
      ]);

      const orders: SchedulerOrder[] = candidates.map((o) => ({
        id: o.id,
        number: o.number,
        priority: o.priority,
        dueDate: o.dueDate,
        createdAt: o.createdAt,
        quantity: Math.max(0, num(o.quantity) - num(o.producedQty)),
        operations: o.bom.operations.map((op) => ({
          sequence: op.sequence,
          name: op.name,
          machineId: op.machineId,
          setupHours: num(op.setupHours),
          runHoursPerUnit: num(op.runHoursPerUnit),
        })),
      }));

      // Orders that fail to (re)schedule keep their existing slots, which then
      // count as busy time for everyone else, so iterate until stable.
      const pinned = new Map<string, string>();
      const schedulerMachines = machines.map(toSchedulerMachine);
      let result: ScheduleResult;
      for (;;) {
        const candidateIds = new Set(orders.filter((o) => !pinned.has(o.id)).map((o) => o.id));
        const busy: SchedulerSlot[] = slots.filter((s) => !candidateIds.has(s.productionOrderId));
        result = autoSchedule({ orders: orders.filter((o) => candidateIds.has(o.id)), machines: schedulerMachines, busy, from: now });
        const newlyPinned = result.unscheduled.filter((u) => slots.some((s) => s.productionOrderId === u.orderId));
        if (newlyPinned.length === 0) break;
        for (const u of newlyPinned) pinned.set(u.orderId, `${u.reason} Its existing schedule was kept.`);
      }

      const byId = new Map(candidates.map((c) => [c.id, c]));
      const summary: AutoScheduleSummary = { scheduled: 0, late: [], unscheduled: [], warnings: [] };

      for (const plan of result.planned) {
        const order = byId.get(plan.orderId)!;
        const { count } = await tx.productionOrder.updateMany({
          where: { id: order.id, status: { in: ["DRAFT", "SCHEDULED"] }, updatedAt: order.updatedAt },
          data: { status: "SCHEDULED", scheduledStart: plan.start, scheduledEnd: plan.end },
        });
        if (count === 0) throw new MfgError(`${order.number} was changed while scheduling. Run the auto-scheduler again.`);
        await tx.productionScheduleSlot.deleteMany({ where: { productionOrderId: order.id } });
        await tx.productionScheduleSlot.createMany({ data: plan.slots.map((s) => ({ ...s, productionOrderId: order.id })) });
        const fmt = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
        await tx.activity.create({
          data: {
            userId: opts.userId,
            entityType: "ProductionOrder",
            entityId: order.id,
            action: "scheduled",
            message: `${order.number} auto-scheduled ${fmt.format(plan.start)} → ${fmt.format(plan.end)} (${plan.slots.length} slot${plan.slots.length === 1 ? "" : "s"})${plan.late ? ", finishing after its due date" : ""}`,
          },
        });
        summary.scheduled++;
        if (plan.late && order.dueDate) summary.late.push({ id: order.id, number: order.number, end: plan.end, dueDate: order.dueDate });
        summary.warnings.push(...plan.warnings);
      }
      const unscheduled = [...result.unscheduled, ...[...pinned].map(([orderId, reason]) => ({ orderId, reason }))];
      for (const u of unscheduled) {
        summary.unscheduled.push({ id: u.orderId, number: byId.get(u.orderId)?.number ?? u.orderId, reason: u.reason });
      }
      return summary;
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}
