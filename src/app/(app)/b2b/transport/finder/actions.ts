"use server";

import { requireUser } from "@/lib/auth";
import { distanceKm } from "@/lib/ops/distance";

/** Approximate road km between two pincodes for the finder's route line. */
export async function routeDistance(fromPin: string, toPin: string): Promise<number | null> {
  await requireUser("transportOps");
  if (!/^\d{6}$/.test(fromPin) || !/^\d{6}$/.test(toPin)) return null;
  return distanceKm(fromPin, toPin);
}
