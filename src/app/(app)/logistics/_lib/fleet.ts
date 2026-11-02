/** Pure fleet helpers: document expiry and fuel efficiency. Safe on client and server. */

const DAY_MS = 24 * 60 * 60 * 1000;

export const EXPIRY_WARNING_DAYS = 30;

export type ExpiryState = "none" | "expired" | "expiring" | "valid";

/** Expired once the date has passed; "expiring" when it falls within the next 30 days. */
export function expiryState(until: Date | null | undefined, now: Date, warnDays = EXPIRY_WARNING_DAYS): ExpiryState {
  if (!until) return "none";
  const t = until.getTime();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  if (t < startOfToday.getTime()) return "expired";
  if (t < startOfToday.getTime() + (warnDays + 1) * DAY_MS) return "expiring";
  return "valid";
}

/** Whole days from today until the date (negative when past). */
export function daysUntil(until: Date, now: Date): number {
  const a = new Date(now);
  a.setHours(0, 0, 0, 0);
  const b = new Date(until);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

export type FuelReading = {
  id: string;
  vehicleId: string;
  date: Date;
  createdAt: Date;
  litres: number;
  odometerKm: number | null;
};

export type FuelEfficiency = { distanceKm: number; kmPerLitre: number };

/**
 * Full-tank method: the fuel bought at a fill covers the distance driven since
 * the previous fill with an odometer reading on the same vehicle. Returns a map
 * of log id → distance and km/l for every log where that can be computed.
 */
export function fuelEfficiency(readings: FuelReading[]): Map<string, FuelEfficiency> {
  const out = new Map<string, FuelEfficiency>();
  const sorted = [...readings].sort(
    (a, b) => a.date.getTime() - b.date.getTime() || a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const lastOdo = new Map<string, number>();
  for (const r of sorted) {
    if (r.odometerKm === null) continue;
    const prev = lastOdo.get(r.vehicleId);
    if (prev !== undefined && r.odometerKm > prev && r.litres > 0) {
      const distanceKm = r.odometerKm - prev;
      out.set(r.id, { distanceKm, kmPerLitre: distanceKm / r.litres });
    }
    lastOdo.set(r.vehicleId, r.odometerKm);
  }
  return out;
}

/** Average km/l over a set of logs = total distance / total litres of the logs that have a figure. */
export function averageKmPerLitre(efficiencies: Iterable<FuelEfficiency>): number | null {
  let distance = 0;
  let litres = 0;
  for (const e of efficiencies) {
    distance += e.distanceKm;
    litres += e.distanceKm / e.kmPerLitre;
  }
  return litres > 0 ? distance / litres : null;
}
