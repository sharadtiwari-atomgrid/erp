/**
 * Finite-capacity production scheduler (a forward, priority-ordered heuristic).
 *
 * Pure function: give it machines, the slots already on the calendar and the
 * orders to plan; it returns the slots to write. No database access, no clock
 * reads (pass `from`), so it is deterministic and unit tested.
 *
 * How it works
 *  1. Orders are sorted by priority (1 = highest), then due date (earliest
 *     first, undated last), then creation time.
 *  2. For each order, BOM operations run in `sequence` order. Each operation
 *     needs setupHours + runHoursPerUnit × quantity on its machine and may
 *     not start before the previous operation of the same order has ended.
 *  3. A machine is available on the unit's working days, from the unit's
 *     shift start for `hoursPerDay` hours. Existing slots (and slots placed
 *     earlier in this run) are busy time. Work is placed into the earliest
 *     free time and may be split across days or around other jobs, so one
 *     operation can produce several slots.
 *  4. An order that cannot be fully placed (machine not active, no working
 *     time, or no room within the horizon) is reported as unscheduled and
 *     consumes no capacity.
 *  5. Orders that end after their due date are flagged `late`.
 *
 * Times use the server's local timezone (shift start "07:00" means 07:00
 * local), matching how the rest of the app renders dates.
 *
 * TODO(ai-planner): this is the seam for a smarter planner. An optimiser or
 * AI planner could take the same `ScheduleInput` and return a
 * `ScheduleResult` (e.g. minimising lateness or changeovers instead of
 * greedy forward loading); callers only depend on these types.
 */

export type SchedulerMachine = {
  id: string;
  name?: string;
  /** Available machine hours per working day. Capped at 24. */
  hoursPerDay: number;
  /** "HH:mm" local time the machine's working day starts (the unit's shift start). */
  shiftStart: string;
  /** ISO weekdays, 1 = Monday … 7 = Sunday. */
  workingDays: number[];
  /** False for machines under maintenance or inactive. */
  available: boolean;
};

export type SchedulerSlot = { machineId: string; start: Date; end: Date };

export type SchedulerOperation = {
  sequence: number;
  name: string;
  machineId: string | null;
  setupHours: number;
  runHoursPerUnit: number;
};

export type SchedulerOrder = {
  id: string;
  number?: string;
  /** 1 = highest. */
  priority: number;
  dueDate: Date | null;
  createdAt?: Date;
  quantity: number;
  operations: SchedulerOperation[];
  /** Do not start before this time (defaults to `from`). */
  earliestStart?: Date | null;
};

export type PlannedSlot = { machineId: string; operationName: string; start: Date; end: Date };

export type OrderPlan = {
  orderId: string;
  slots: PlannedSlot[];
  start: Date;
  end: Date;
  late: boolean;
  warnings: string[];
};

export type UnscheduledOrder = { orderId: string; reason: string };

export type ScheduleInput = {
  orders: SchedulerOrder[];
  machines: SchedulerMachine[];
  /** Slots already on the calendar that must not be overlapped. */
  busy: SchedulerSlot[];
  /** Nothing is placed before this instant. */
  from: Date;
  /** How far ahead to look for capacity before giving up. Default 180 days. */
  horizonDays?: number;
  /** Ignore free gaps shorter than this unless the remaining work fits. Default 15. */
  minSegmentMinutes?: number;
  /** `from` is rounded up to a multiple of this many minutes. Default 15. */
  alignMinutes?: number;
};

export type ScheduleResult = { planned: OrderPlan[]; unscheduled: UnscheduledOrder[] };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

type Interval = { start: number; end: number };

/** Priority, then due date (undated last), then creation time, then id for stability. */
export function compareOrders(a: SchedulerOrder, b: SchedulerOrder): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  const ad = a.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
  const bd = b.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
  if (ad !== bd) return ad < bd ? -1 : 1;
  const ac = a.createdAt?.getTime() ?? 0;
  const bc = b.createdAt?.getTime() ?? 0;
  if (ac !== bc) return ac - bc;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function isoWeekday(d: Date): number {
  const day = d.getDay();
  return day === 0 ? 7 : day;
}

function parseShiftStart(value: string): { h: number; m: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return { h: 9, m: 0 };
  return { h: Math.min(23, Number(match[1])), m: Math.min(59, Number(match[2])) };
}

/** Working window of a machine on the calendar day containing `day` (local time). */
export function workingWindow(machine: SchedulerMachine, day: Date): Interval | null {
  if (!machine.workingDays.includes(isoWeekday(day))) return null;
  const hours = Math.min(24, Math.max(0, machine.hoursPerDay));
  if (hours <= 0) return null;
  const { h, m } = parseShiftStart(machine.shiftStart);
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m).getTime();
  return { start, end: start + Math.round(hours * 60) * MINUTE };
}

/** End of the local calendar day of `d`, used for due-date comparisons. */
export function endOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function insertSorted(list: Interval[], item: Interval) {
  let i = list.length;
  while (i > 0 && list[i - 1].start > item.start) i--;
  list.splice(i, 0, item);
}

/** Free parts of [from, to) given busy intervals sorted by start. */
function freeParts(from: number, to: number, busy: Interval[]): Interval[] {
  const parts: Interval[] = [];
  let cursor = from;
  for (const b of busy) {
    if (b.end <= cursor) continue;
    if (b.start >= to) break;
    if (b.start > cursor) parts.push({ start: cursor, end: Math.min(b.start, to) });
    cursor = Math.max(cursor, b.end);
    if (cursor >= to) break;
  }
  if (cursor < to) parts.push({ start: cursor, end: to });
  return parts;
}

/**
 * Places `durationMs` of work on one machine starting no earlier than
 * `earliest`. Returns the (merged) segments, or null if it does not fit
 * within `limit`.
 */
function placeOperation(
  machine: SchedulerMachine,
  busy: Interval[],
  earliest: number,
  durationMs: number,
  limit: number,
  minSegmentMs: number,
): Interval[] | null {
  let remaining = durationMs;
  const segments: Interval[] = [];
  const first = new Date(earliest);
  // Start one day back: a window that began yesterday may run past midnight.
  for (let offset = -1; ; offset++) {
    const day = new Date(first.getFullYear(), first.getMonth(), first.getDate() + offset);
    if (day.getTime() > limit) return null;
    const window = workingWindow(machine, day);
    if (!window) continue;
    const from = Math.max(window.start, earliest, segments.at(-1)?.end ?? 0);
    if (from >= window.end) continue;
    for (const part of freeParts(from, window.end, busy)) {
      const length = part.end - part.start;
      if (length < minSegmentMs && length < remaining) continue;
      const take = Math.min(length, remaining);
      const last = segments.at(-1);
      if (last && last.end === part.start) last.end += take;
      else segments.push({ start: part.start, end: part.start + take });
      remaining -= take;
      if (remaining <= 0) return segments;
    }
  }
}

export function autoSchedule(input: ScheduleInput): ScheduleResult {
  const horizonDays = input.horizonDays ?? 180;
  const minSegmentMs = (input.minSegmentMinutes ?? 15) * MINUTE;
  const align = Math.max(1, input.alignMinutes ?? 15) * MINUTE;
  const from = Math.ceil(input.from.getTime() / align) * align;
  const limit = from + horizonDays * 24 * HOUR;

  const machines = new Map(input.machines.map((m) => [m.id, m]));
  const busy = new Map<string, Interval[]>();
  for (const m of input.machines) busy.set(m.id, []);
  for (const s of input.busy) {
    const list = busy.get(s.machineId);
    if (list && s.end > s.start) insertSorted(list, { start: s.start.getTime(), end: s.end.getTime() });
  }

  const planned: OrderPlan[] = [];
  const unscheduled: UnscheduledOrder[] = [];

  for (const order of [...input.orders].sort(compareOrders)) {
    const label = order.number ?? order.id;
    const ops = [...order.operations].sort((a, b) => a.sequence - b.sequence);
    if (ops.length === 0) {
      unscheduled.push({ orderId: order.id, reason: `${label}: the BOM has no operations to schedule.` });
      continue;
    }

    const warnings: string[] = [];
    const slots: PlannedSlot[] = [];
    const added: Array<{ list: Interval[]; item: Interval }> = [];
    let cursor = Math.max(from, order.earliestStart?.getTime() ?? 0);
    let failure: string | null = null;

    for (const op of ops) {
      const durationMs = Math.round((op.setupHours + op.runHoursPerUnit * order.quantity) * 60) * MINUTE;
      if (durationMs <= 0) continue;
      if (!op.machineId) {
        warnings.push(`${label}: operation "${op.name}" has no machine and was not scheduled.`);
        continue;
      }
      const machine = machines.get(op.machineId);
      if (!machine || !machine.available) {
        failure = `${label}: machine for "${op.name}" is not active.`;
        break;
      }
      const list = busy.get(machine.id)!;
      const segments = placeOperation(machine, list, cursor, durationMs, limit, minSegmentMs);
      if (!segments) {
        failure = `${label}: no free time on ${machine.name ?? "the machine"} for "${op.name}" within ${horizonDays} days.`;
        break;
      }
      for (const seg of segments) {
        const item = { ...seg };
        insertSorted(list, item);
        added.push({ list, item });
        slots.push({ machineId: machine.id, operationName: op.name, start: new Date(seg.start), end: new Date(seg.end) });
      }
      cursor = segments.at(-1)!.end;
    }

    if (!failure && slots.length === 0) failure = `${label}: no operation has machine time to schedule.`;
    if (failure) {
      // Roll back the capacity this order took.
      for (const { list, item } of added) list.splice(list.indexOf(item), 1);
      unscheduled.push({ orderId: order.id, reason: failure });
      continue;
    }

    const start = slots.reduce((min, s) => (s.start < min ? s.start : min), slots[0].start);
    const end = slots.reduce((max, s) => (s.end > max ? s.end : max), slots[0].end);
    const late = order.dueDate ? end.getTime() > endOfLocalDay(order.dueDate).getTime() : false;
    planned.push({ orderId: order.id, slots, start, end, late, warnings });
  }

  return { planned, unscheduled };
}
