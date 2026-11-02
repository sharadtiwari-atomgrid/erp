import { describe, expect, it } from "vitest";
import { averageKmPerLitre, expiryState, fuelEfficiency, type FuelReading } from "./fleet";

describe("expiryState", () => {
  const now = new Date(2026, 10, 2, 15, 0);
  it("classifies dates", () => {
    expect(expiryState(null, now)).toBe("none");
    expect(expiryState(new Date(2026, 10, 1), now)).toBe("expired");
    expect(expiryState(new Date(2026, 10, 2), now)).toBe("expiring");
    expect(expiryState(new Date(2026, 11, 2), now)).toBe("expiring");
    expect(expiryState(new Date(2026, 11, 3), now)).toBe("valid");
  });
});

describe("fuelEfficiency", () => {
  const r = (id: string, vehicleId: string, day: number, litres: number, odometerKm: number | null): FuelReading => ({
    id,
    vehicleId,
    date: new Date(2026, 10, day),
    createdAt: new Date(2026, 10, day),
    litres,
    odometerKm,
  });

  it("computes km/l from consecutive odometer readings per vehicle", () => {
    const eff = fuelEfficiency([
      r("a2", "A", 5, 40, 10_400),
      r("a1", "A", 1, 50, 10_000),
      r("b1", "B", 2, 30, 5_000),
      r("a3", "A", 9, 20, null),
      r("b2", "B", 6, 25, 5_200),
      r("a4", "A", 12, 50, 10_900),
    ]);
    expect(eff.has("a1")).toBe(false);
    expect(eff.get("a2")).toEqual({ distanceKm: 400, kmPerLitre: 10 });
    expect(eff.get("b2")).toEqual({ distanceKm: 200, kmPerLitre: 8 });
    expect(eff.has("a3")).toBe(false);
    expect(eff.get("a4")).toEqual({ distanceKm: 500, kmPerLitre: 10 });
    expect(averageKmPerLitre(eff.values())).toBeCloseTo(1100 / 115);
  });

  it("returns null average when nothing can be computed", () => {
    expect(averageKmPerLitre([])).toBeNull();
  });
});
