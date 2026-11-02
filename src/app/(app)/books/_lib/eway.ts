/**
 * E-way bill rules (pure functions, safe on client and server).
 *
 * EWB numbers are generated on the GST portal (ewaybillgst.gov.in) and only
 * recorded in the ERP. Validity follows Rule 138(10) of the CGST Rules for
 * normal cargo: 1 day for up to 200 km, plus 1 day for every further 200 km
 * or part thereof. A "day" ends at midnight (IST) of the day immediately
 * following the date of generation, so N days of validity end at 23:59:59.999
 * IST on (generation date + N).
 */

/** India Standard Time is UTC+05:30 with no daylight saving. */
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Kilometres covered per day of validity for normal (non over-dimensional) cargo. */
export const NORMAL_CARGO_KM_PER_DAY = 200;

/** Strips the spaces people type when copying "1234 5678 9012" from the portal. */
export function normaliseEwbNumber(raw: string): string {
  return raw.replace(/[\s-]/g, "");
}

/** E-way bill numbers are exactly 12 digits. */
export function isValidEwbNumber(raw: string): boolean {
  return /^\d{12}$/.test(normaliseEwbNumber(raw));
}

/** Days of validity: ceil(distance / 200), never less than 1. */
export function ewayValidityDays(distanceKm: number, kmPerDay = NORMAL_CARGO_KM_PER_DAY): number {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 1;
  return Math.max(1, Math.ceil(distanceKm / kmPerDay));
}

/** Last moment the e-way bill is valid: 23:59:59.999 IST on generation date + validity days. */
export function ewayValidUntil(generatedAt: Date, distanceKm: number, kmPerDay = NORMAL_CARGO_KM_PER_DAY): Date {
  const days = ewayValidityDays(distanceKm, kmPerDay);
  const ist = new Date(generatedAt.getTime() + IST_OFFSET_MS);
  const endIst = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + days, 23, 59, 59, 999);
  return new Date(endIst - IST_OFFSET_MS);
}

/** Parses an `<input type="datetime-local">` value ("YYYY-MM-DDTHH:mm") as IST. */
export function parseIstDateTime(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m.map(Number);
  const utc = Date.UTC(y, mo - 1, d, h, mi, Number.isNaN(s) ? 0 : s) - IST_OFFSET_MS;
  const date = new Date(utc);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Formats a date as an IST "YYYY-MM-DDTHH:mm" string for datetime-local inputs. */
export function toIstDateTimeInput(date: Date): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 16);
}

export type EwbLike = { status: string; generatedAt: Date; validUntil: Date };

/** ACTIVE bills past their validity are shown as EXPIRED (the stored status isn't rewritten). */
export function ewayDisplayStatus(bill: EwbLike, now: Date): "ACTIVE" | "EXPIRED" | "CANCELLED" {
  if (bill.status === "CANCELLED") return "CANCELLED";
  if (bill.status === "EXPIRED" || bill.validUntil.getTime() < now.getTime()) return "EXPIRED";
  return "ACTIVE";
}

/** The portal allows cancellation within 24 hours of generation. */
export function canCancelEwb(bill: EwbLike, now: Date): boolean {
  return bill.status === "ACTIVE" && now.getTime() - bill.generatedAt.getTime() < DAY_MS;
}
