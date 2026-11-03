/**
 * Long-hold SLA: a PO sitting on the Fresh PO board for more than
 * LONG_HOLD_DAYS moves to Long Hold. Days are IST calendar days. Pure.
 */
import { daysBetween, parseDay, todayIso } from "@/lib/ops/dates";
import { LONG_HOLD_DAYS } from "@/lib/ops/lists";

export { LONG_HOLD_DAYS };

/** Rows within this many days of the limit show a "Day N/15" badge. */
export const SLA_WARN_DAYS = 3;

export type SlaInput = {
  poDate?: Date | string | null;
  holdReleasedAt?: Date | string | null;
  createdAt?: Date | string | null;
};

function day(value: Date | string | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  return parseDay(value);
}

/** The IST day of a timestamp (createdAt). */
function istDay(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : todayIso(d);
}

/**
 * Whole days a PO has been on the Fresh PO board: from the PO date, or from the
 * day it came back from Long Hold if that is later, else from when it was created.
 */
export function daysInFreshPo(po: SlaInput, today: string = todayIso()): number {
  const base = day(po.poDate) || istDay(po.createdAt);
  const back = day(po.holdReleasedAt);
  const from = back && (!base || back > base) ? back : base;
  if (!from) return 0;
  return daysBetween(from, today) ?? 0;
}

/** Over the limit, so it belongs on Long Hold. */
export function isLongHoldDue(po: SlaInput, today: string = todayIso()): boolean {
  return daysInFreshPo(po, today) > LONG_HOLD_DAYS;
}

/** The "Day N/15" badge text in the last few days before the limit, else null. */
export function slaBadge(po: SlaInput, today: string = todayIso()): string | null {
  const d = daysInFreshPo(po, today);
  return d >= LONG_HOLD_DAYS - SLA_WARN_DAYS ? `Day ${d}/${LONG_HOLD_DAYS}` : null;
}
