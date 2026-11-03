import "server-only";

/**
 * Approximate road distance (km) between two Indian pincodes. Each pincode is
 * geocoded with OpenStreetMap Nominatim and the driving distance comes from the
 * public OSRM server; when routing fails it falls back to the great-circle
 * distance × 1.3. No API keys. Results are cached in memory per process.
 */

type Point = { lat: number; lon: number };

const geoCache = new Map<string, Point | null>();
const distCache = new Map<string, number>();
const USER_AGENT = "AtomgridERP/1.0 (domestic logistics distance)";
const TIMEOUT_MS = 8000;

export const isPincode = (v: unknown) => /^\d{6}$/.test(String(v ?? "").trim());

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function geocode(pin: string): Promise<Point | null> {
  if (geoCache.has(pin)) return geoCache.get(pin)!;
  try {
    const j = await getJson(`https://nominatim.openstreetmap.org/search?postalcode=${pin}&country=India&format=json&limit=1`, {
      "User-Agent": USER_AGENT,
    });
    const hit = Array.isArray(j) && j[0] ? { lat: parseFloat(j[0].lat), lon: parseFloat(j[0].lon) } : null;
    const ok = hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lon) ? hit : null;
    geoCache.set(pin, ok);
    return ok;
  } catch {
    return null; // not cached: a network blip shouldn't stick
  }
}

async function roadKm(a: Point, b: Point): Promise<number | null> {
  try {
    const j = (await getJson(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`)) as {
      routes?: Array<{ distance?: number }>;
    };
    const m = j?.routes?.[0]?.distance;
    return typeof m === "number" ? Math.round(m / 1000) : null;
  } catch {
    return null;
  }
}

/** Great-circle distance × 1.3, as an approximation of road distance. */
export function haversineKm(a: Point, b: Point): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)) * 1.3);
}

export type DistanceResult = { ok: true; km: number; cached?: boolean } | { ok: false; error: string };

/** Distance with a reason when it can't be worked out. */
export async function distanceResult(fromPin: string, toPin: string): Promise<DistanceResult> {
  const from = String(fromPin ?? "").trim();
  const to = String(toPin ?? "").trim();
  if (!isPincode(from) || !isPincode(to)) return { ok: false, error: "Both pincodes must be 6 digits." };
  if (from === to) return { ok: true, km: 0, cached: true };
  const key = `${from}->${to}`;
  const hit = distCache.get(key) ?? distCache.get(`${to}->${from}`);
  if (hit !== undefined) return { ok: true, km: hit, cached: true };
  const [ga, gb] = await Promise.all([geocode(from), geocode(to)]);
  if (!ga || !gb) return { ok: false, error: "Could not locate one of the pincodes." };
  const km = (await roadKm(ga, gb)) ?? haversineKm(ga, gb);
  distCache.set(key, km);
  return { ok: true, km };
}

/** Road km between two 6-digit pincodes, or null when it can't be worked out. */
export async function distanceKm(fromPin: string, toPin: string): Promise<number | null> {
  const r = await distanceResult(fromPin, toPin);
  return r.ok ? r.km : null;
}
