import { workingWindow, type SchedulerMachine } from "./scheduler";

export type DayLoad = { date: Date; availableHours: number; bookedHours: number };

const HOUR = 3_600_000;

/** Booked vs available machine hours per local calendar day, starting at `from`'s day. */
export function dailyLoad(machine: SchedulerMachine, slots: Array<{ start: Date; end: Date }>, from: Date, days: number): DayLoad[] {
  const out: DayLoad[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    const next = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i + 1);
    const window = workingWindow(machine, date);
    const availableHours = window ? (window.end - window.start) / HOUR : 0;
    let booked = 0;
    for (const s of slots) {
      const a = Math.max(s.start.getTime(), date.getTime());
      const b = Math.min(s.end.getTime(), next.getTime());
      if (b > a) booked += b - a;
    }
    out.push({ date, availableHours, bookedHours: Math.round((booked / HOUR) * 100) / 100 });
  }
  return out;
}

export function utilisationPct(load: DayLoad[]): number {
  const available = load.reduce((s, d) => s + d.availableHours, 0);
  const booked = load.reduce((s, d) => s + d.bookedHours, 0);
  return available > 0 ? Math.round((booked / available) * 100) : 0;
}

type Numeric = number | { toString(): string };

/** Maps a Machine row (with its unit) to the scheduler's machine shape. */
export function toSchedulerMachine(m: {
  id: string;
  code: string;
  name: string;
  hoursPerDay: Numeric;
  status: string;
  productionUnit: { shiftStart: string; workingDays: number[]; isActive: boolean };
}): SchedulerMachine {
  return {
    id: m.id,
    name: `${m.code} ${m.name}`,
    hoursPerDay: Number(m.hoursPerDay.toString()),
    shiftStart: m.productionUnit.shiftStart,
    workingDays: m.productionUnit.workingDays,
    available: m.status === "ACTIVE" && m.productionUnit.isActive,
  };
}
