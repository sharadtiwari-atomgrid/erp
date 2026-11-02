"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatNumber, num } from "@/lib/format";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { optionalId, optionalNumber } from "../_lib/fields";

const fuelSchema = z.object({
  vehicleId: f.id("Vehicle"),
  driverId: optionalId(),
  date: f.date(),
  litres: f.number({ min: 0.01, label: "Litres" }),
  amount: f.number({ min: 0, label: "Amount" }),
  odometerKm: optionalNumber("Odometer"),
  station: f.optionalText(),
  notes: f.optionalText(),
});

export async function createFuelLog(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("fleet", "edit");
  const parsed = parseForm(fuelSchema, formData);
  if (!parsed.ok) return parsed.state;
  const data = parsed.data;

  const vehicle = await db.vehicle.findUnique({
    where: { id: data.vehicleId },
    select: { registrationNo: true, assignments: { where: { endDate: null }, take: 1, select: { driverId: true } } },
  });
  if (!vehicle) return { fieldErrors: { vehicleId: ["Vehicle not found"] } };

  if (data.odometerKm !== null) {
    const previous = await db.fuelLog.findFirst({
      where: { vehicleId: data.vehicleId, odometerKm: { not: null }, date: { lte: data.date } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: { odometerKm: true },
    });
    if (previous && num(previous.odometerKm) > data.odometerKm) {
      return { fieldErrors: { odometerKm: [`Lower than the previous reading of ${formatNumber(previous.odometerKm, 1)} km`] } };
    }
  }

  await db.$transaction(async (tx) => {
    const log = await tx.fuelLog.create({
      data: { ...data, driverId: data.driverId ?? vehicle.assignments[0]?.driverId ?? null },
    });
    await logActivity(
      {
        userId: user.id,
        entityType: "Vehicle",
        entityId: data.vehicleId,
        action: "fuel",
        message: `${formatNumber(data.litres, 2)} L fuel logged for ${vehicle.registrationNo}`,
      },
      tx,
    );
    return log;
  });

  revalidatePath("/logistics/fuel");
  revalidatePath(`/logistics/vehicles/${data.vehicleId}`);
  return { success: `Fuel logged for ${vehicle.registrationNo}.` };
}
