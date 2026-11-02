"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { VehicleOwnership } from "@/generated/prisma/enums";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { isUniqueViolation, optionalId, optionalNumber, optionalTime, registrationNo } from "../_lib/fields";

const vehicleSchema = z
  .object({
    registrationNo: registrationNo(),
    type: f.text("Type"),
    make: f.optionalText(),
    model: f.optionalText(),
    capacityKg: optionalNumber("Capacity"),
    ownership: z.enum(VehicleOwnership, { error: "Choose the ownership" }),
    transporterId: optionalId(),
    branchId: optionalId(),
    status: z.enum(["AVAILABLE", "MAINTENANCE", "INACTIVE"], { error: "Choose a status" }),
    operatingStart: optionalTime("Start time"),
    operatingEnd: optionalTime("End time"),
    insuranceUntil: f.optionalDate(),
    fitnessUntil: f.optionalDate(),
    permitUntil: f.optionalDate(),
    notes: f.optionalText(),
  })
  .refine((v) => v.ownership !== "THIRD_PARTY" || !!v.transporterId, {
    path: ["transporterId"],
    message: "Third-party vehicles need a transporter",
  });

function revalidateVehicle(id: string) {
  revalidatePath("/logistics/vehicles");
  revalidatePath(`/logistics/vehicles/${id}`);
}

const duplicate: ActionState = { fieldErrors: { registrationNo: ["Another vehicle already has this registration number"] } };

export async function createVehicle(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("fleet", "edit");
  const parsed = parseForm(vehicleSchema, formData);
  if (!parsed.ok) return parsed.state;
  const data = { ...parsed.data, transporterId: parsed.data.ownership === "OWN" ? null : parsed.data.transporterId };

  let id: string;
  try {
    id = await db.$transaction(async (tx) => {
      const created = await tx.vehicle.create({ data });
      await logActivity(
        { userId: user.id, entityType: "Vehicle", entityId: created.id, action: "created", message: `Vehicle ${created.registrationNo} added` },
        tx,
      );
      return created.id;
    });
  } catch (e) {
    if (isUniqueViolation(e)) return duplicate;
    throw e;
  }

  revalidateVehicle(id);
  redirect(`/logistics/vehicles/${id}`);
}

export async function updateVehicle(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("fleet", "edit");
  const parsed = parseForm(vehicleSchema, formData);
  if (!parsed.ok) return parsed.state;

  const current = await db.vehicle.findUnique({ where: { id }, select: { status: true } });
  if (!current) return { error: "Vehicle not found." };
  const { status, ...rest } = parsed.data;
  const data = {
    ...rest,
    transporterId: rest.ownership === "OWN" ? null : rest.transporterId,
    // ON_TRIP is owned by the trip workflow; editing the vehicle never changes it.
    ...(current.status !== "ON_TRIP" && { status }),
  };

  try {
    await db.$transaction(async (tx) => {
      const updated = await tx.vehicle.update({ where: { id }, data });
      await logActivity(
        { userId: user.id, entityType: "Vehicle", entityId: id, action: "updated", message: `Vehicle ${updated.registrationNo} updated` },
        tx,
      );
    });
  } catch (e) {
    if (isUniqueViolation(e)) return duplicate;
    throw e;
  }

  revalidateVehicle(id);
  redirect(`/logistics/vehicles/${id}`);
}

/** Assigns a driver, ending the vehicle's current assignment and any the driver has on another vehicle. */
export async function assignDriver(vehicleId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("fleet", "edit");
  const driverId = String(formData.get("driverId") ?? "");
  if (!driverId) return { error: "Choose a driver." };

  const [vehicle, driver] = await Promise.all([
    db.vehicle.findUnique({ where: { id: vehicleId }, select: { registrationNo: true } }),
    db.driver.findUnique({ where: { id: driverId }, select: { name: true, isActive: true } }),
  ]);
  if (!vehicle) return { error: "Vehicle not found." };
  if (!driver || !driver.isActive) return { error: "Choose an active driver." };

  const ended = await db.$transaction(async (tx) => {
    const now = new Date();
    const previous = await tx.driverAssignment.findMany({
      where: { endDate: null, OR: [{ vehicleId }, { driverId }] },
      select: { driverId: true, vehicleId: true },
    });
    await tx.driverAssignment.updateMany({ where: { endDate: null, OR: [{ vehicleId }, { driverId }] }, data: { endDate: now } });
    await tx.driverAssignment.create({ data: { vehicleId, driverId, startDate: now } });
    await logActivity(
      { userId: user.id, entityType: "Vehicle", entityId: vehicleId, action: "driver_assigned", message: `${driver.name} assigned to ${vehicle.registrationNo}` },
      tx,
    );
    return previous;
  });

  revalidateVehicle(vehicleId);
  for (const p of ended) {
    revalidatePath(`/logistics/drivers/${p.driverId}`);
    revalidatePath(`/logistics/vehicles/${p.vehicleId}`);
  }
  revalidatePath(`/logistics/drivers/${driverId}`);
  return undefined;
}

export async function endAssignment(assignmentId: string): Promise<ActionState> {
  const user = await requireUser("fleet", "edit");
  const assignment = await db.driverAssignment.findUnique({
    where: { id: assignmentId },
    include: { driver: { select: { name: true } }, vehicle: { select: { registrationNo: true } } },
  });
  if (!assignment) return { error: "Assignment not found." };

  const { count } = await db.driverAssignment.updateMany({ where: { id: assignmentId, endDate: null }, data: { endDate: new Date() } });
  if (count === 0) return { error: "This assignment has already ended." };
  await logActivity({
    userId: user.id,
    entityType: "Vehicle",
    entityId: assignment.vehicleId,
    action: "driver_unassigned",
    message: `${assignment.driver.name} unassigned from ${assignment.vehicle.registrationNo}`,
  });

  revalidateVehicle(assignment.vehicleId);
  revalidatePath(`/logistics/drivers/${assignment.driverId}`);
  return undefined;
}
