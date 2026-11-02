/** Calendar range maths for the schedule views (local time). */

export type View = "day" | "week" | "month";

export type CalendarRange = {
  view: View;
  start: Date;
  end: Date;
  /** Column boundaries: hours for day view, days for week/month. */
  columns: Date[];
  prev: Date;
  next: Date;
  label: string;
};

const day = (d: Date, offset = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset);

/** Parses "YYYY-MM-DD" as a local date; falls back to `fallback`. */
export function parseLocalDate(value: string, fallback: Date): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return day(fallback);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? day(fallback) : d;
}

export function toLocalDateParam(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IN", opts);

export function calendarRange(view: View, anchor: Date): CalendarRange {
  if (view === "day") {
    const start = day(anchor);
    return {
      view,
      start,
      end: day(start, 1),
      columns: Array.from({ length: 24 }, (_, h) => new Date(start.getFullYear(), start.getMonth(), start.getDate(), h)),
      prev: day(start, -1),
      next: day(start, 1),
      label: fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(start),
    };
  }
  if (view === "month") {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    return {
      view,
      start,
      end,
      columns: Array.from({ length: days }, (_, i) => day(start, i)),
      prev: new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1),
      next: end,
      label: fmt({ month: "long", year: "numeric" }).format(start),
    };
  }
  const weekday = anchor.getDay() === 0 ? 7 : anchor.getDay();
  const start = day(anchor, 1 - weekday);
  const end = day(start, 7);
  const last = day(start, 6);
  return {
    view: "week",
    start,
    end,
    columns: Array.from({ length: 7 }, (_, i) => day(start, i)),
    prev: day(start, -7),
    next: end,
    label: `${fmt({ day: "numeric", month: "short" }).format(start)} – ${fmt({ day: "numeric", month: "short", year: "numeric" }).format(last)}`,
  };
}

/** Left offset and width (percent of the range) for an interval, clipped to the range. */
export function placement(range: { start: Date; end: Date }, start: Date, end: Date): { left: number; width: number } | null {
  const total = range.end.getTime() - range.start.getTime();
  const a = Math.max(start.getTime(), range.start.getTime());
  const b = Math.min(end.getTime(), range.end.getTime());
  if (b <= a) return null;
  return { left: ((a - range.start.getTime()) / total) * 100, width: ((b - a) / total) * 100 };
}

const PALETTE = [
  "bg-blue-500/85 border-blue-700 text-white",
  "bg-emerald-500/85 border-emerald-700 text-white",
  "bg-violet-500/85 border-violet-700 text-white",
  "bg-amber-400/90 border-amber-600 text-amber-950",
  "bg-pink-500/85 border-pink-700 text-white",
  "bg-cyan-500/85 border-cyan-700 text-white",
  "bg-orange-500/85 border-orange-700 text-white",
  "bg-teal-600/85 border-teal-800 text-white",
  "bg-indigo-500/85 border-indigo-700 text-white",
  "bg-lime-500/90 border-lime-700 text-lime-950",
];

/** Stable colour per production order. */
export function orderColor(orderId: string): string {
  let h = 0;
  for (let i = 0; i < orderId.length; i++) h = (h * 31 + orderId.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
