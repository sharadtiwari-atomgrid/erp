/**
 * Date helpers for Domestic B2B. Business dates are calendar days in India:
 * "today" is today in IST, and day-only values are stored as UTC midnight
 * (Prisma @db.Date). Safe to import on the client.
 */

const IST_OFFSET_MS = 330 * 60_000;

/** Today in IST as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** YYYY-MM-DD → Date at UTC midnight (what @db.Date columns hold). */
export function dayFromIso(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** A stored day (UTC midnight) → YYYY-MM-DD. */
export function isoFromDay(d: Date | string | null | undefined): string {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

/** dd/mm/yyyy for display. */
export function formatDmy(d: Date | string | null | undefined): string {
  const iso = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : isoFromDay(d);
  if (!iso) return "";
  const [y, m, day] = iso.split("-");
  return `${day}/${m}/${y}`;
}

/** Whole days from a to b (b − a); null if either is missing. */
export function daysBetween(a: Date | string | null | undefined, b: Date | string | null | undefined): number | null {
  const x = typeof a === "string" ? a : isoFromDay(a);
  const y = typeof b === "string" ? b : isoFromDay(b);
  if (!x || !y) return null;
  return Math.round((dayFromIso(y).getTime() - dayFromIso(x).getTime()) / 86_400_000);
}

export function addDaysIso(iso: string, days: number): string {
  return isoFromDay(new Date(dayFromIso(iso).getTime() + days * 86_400_000));
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/**
 * Lenient day parser for sheets and pasted text → YYYY-MM-DD or "".
 * Accepts dd/mm/yy(yy), dd-mm-yy(yy), dd.mm.yyyy, yyyy-mm-dd (with optional time),
 * Excel serial numbers, Date objects and "8-Jun-28" / "08 Jun 2028".
 */
export function parseDay(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : isoFromDay(new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate())));
  if (typeof value === "number") {
    if (value > 20000 && value < 80000) return isoFromDay(new Date(Date.UTC(1899, 11, 30) + value * 86_400_000));
    return "";
  }
  const s = String(value).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/);
  if (m) return valid(year(+m[3]), +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[\s\-/]([A-Za-z]{3})[A-Za-z]*[\s\-/,]*(\d{2,4})$/);
  if (m && MONTHS[m[2].toLowerCase()]) return valid(year(+m[3]), MONTHS[m[2].toLowerCase()], +m[1]);
  if (/^\d{5}(\.\d+)?$/.test(s)) return parseDay(Number(s));
  return "";
}

function year(y: number) {
  return y < 100 ? 2000 + y : y;
}

function valid(y: number, mo: number, d: number): string {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return "";
  return dt.toISOString().slice(0, 10);
}

/** Lenient number parser: "1,000.50", "25 Kgs", "₹800" → number; "N/A", "-", "nil" → null. */
export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const s = String(value).replace(/,/g, "").trim();
  if (/^(n\/?a|nil|none|-+|—)$/i.test(s)) return null;
  const m = s.match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}
