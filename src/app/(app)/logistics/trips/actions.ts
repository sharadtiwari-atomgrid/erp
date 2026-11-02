"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { defaultBranchId } from "@/lib/branch";
import { db } from "@/lib/db";
import { formatNumber, num } from "@/lib/format";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { nextDocumentNumber } from "@/lib/sequence";
import { parseIstDateTime } from "../../books/_lib/eway";
import { attempt } from "../../sales/_lib/attempt";
import { DocumentError } from "../../sales/_lib/documents";
import { optionalId } from "../_lib/fields";

/** Outbound statuses that can be loaded onto a trip. */
const LOADABLE = ["PACKED", "DISPATCHED"] as const;

const tripSchema = z.object({
  vehicleId: f.id("Vehicle"),
  driverId: optionalId(),
  origin: f.text("Origin"),
  destination: f.text("Destination"),
  plannedStart: z
    .string()
    .optional()
    .transform((v) => (v ? parseIstDateTime(v) : null)),
  freightCost: f.number({ label: "Freight cost" }),
  notes: f.optionalText(),
});

function revalidateTrip(id: string, vehicleId?: string) {
  revalidatePath("/logistics/trips");
  revalidatePath(`/logistics/trips/${id}`);
  revalidatePath("/logistics/documents");
  if (vehicleId) {
    revalidatePath("/logistics/vehicles");
    revalidatePath(`/logistics/vehicles/${vehicleId}`);
  }
}

/** Blank driver → the vehicle's currently assigned driver. */
async function resolveDriver(vehicleId: string, driverId: string | null) {
  if (driverId) return driverId;
  const assignment = await db.driverAssignment.findFirst({ where: { vehicleId, endDate: null }, select: { driverId: true } });
  return assignment?.driverId ?? null;
}

export async function createTrip(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("trips", "edit");
  const parsed = parseForm(tripSchema, formData);
  if (!parsed.ok) return parsed.state;

  const vehicle = await db.vehicle.findUnique({ where: { id: parsed.data.vehicleId }, select: { status: true } });
  if (!vehicle) return { fieldErrors: { vehicleId: ["Vehicle not found"] } };
  if (vehicle.status === "INACTIVE") return { fieldErrors: { vehicleId: ["This vehicle is inactive"] } };

  const driverId = await resolveDriver(parsed.data.vehicleId, parsed.data.driverId);
  const branchId = await defaultBranchId();
  const trip = await db.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, "TRIP");
    const created = await tx.trip.create({ data: { ...parsed.data, driverId, branchId, number } });
    await logActivity(
      {
        userId: user.id,
        entityType: "Trip",
        entityId: created.id,
        action: "created",
        message: `Trip ${number} planned: ${created.origin} → ${created.destination}`,
      },
      tx,
    );
    return created;
  });

  revalidateTrip(trip.id, trip.vehicleId);
  redirect(`/logistics/trips/${trip.id}`);
}

export async function updateTrip(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("trips", "edit");
  const parsed = parseForm(tripSchema, formData);
  if (!parsed.ok) return parsed.state;
  const driverId = await resolveDriver(parsed.data.vehicleId, parsed.data.driverId);

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const { count } = await tx.trip.updateMany({ where: { id, status: "PLANNED" }, data: { ...parsed.data, driverId } });
      if (count === 0) throw new DocumentError("Only planned trips can be edited.");
      const trip = await tx.trip.findUniqueOrThrow({ where: { id }, select: { number: true } });
      await logActivity({ userId: user.id, entityType: "Trip", entityId: id, action: "updated", message: `Trip ${trip.number} updated` }, tx);
    }),
  );
  if (!result.ok) return { error: result.error };

  revalidateTrip(id, parsed.data.vehicleId);
  redirect(`/logistics/trips/${id}`);
}

/** Loads a PACKED or DISPATCHED outbound order that isn't on another trip. */
export async function attachOutbound(tripId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("trips", "edit");
  const outboundId = String(formData.get("outboundId") ?? "");
  if (!outboundId) return { error: "Choose an outbound order." };

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const trip = await tx.trip.findUnique({ where: { id: tripId }, select: { number: true, status: true } });
      if (!trip) throw new DocumentError("Trip not found.");
      if (trip.status !== "PLANNED") throw new DocumentError("Outbound orders can only be added while the trip is planned.");
      const { count } = await tx.outboundOrder.updateMany({
        where: { id: outboundId, tripId: null, status: { in: [...LOADABLE] } },
        data: { tripId },
      });
      if (count === 0) throw new DocumentError("That outbound order is no longer packed/dispatched or is already on a trip.");
      const outbound = await tx.outboundOrder.findUniqueOrThrow({ where: { id: outboundId }, select: { number: true } });
      await logActivity(
        { userId: user.id, entityType: "Trip", entityId: tripId, action: "outbound_added", message: `${outbound.number} loaded on trip ${trip.number}` },
        tx,
      );
    }),
  );
  if (!result.ok) return { error: result.error };

  revalidateTrip(tripId);
  revalidatePath(`/warehouse/outbound/${outboundId}`);
  return undefined;
}

export async function detachOutbound(tripId: string, outboundId: string): Promise<ActionState> {
  const user = await requireUser("trips", "edit");
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const trip = await tx.trip.findUnique({ where: { id: tripId }, select: { number: true, status: true } });
      if (!trip) throw new DocumentError("Trip not found.");
      if (trip.status !== "PLANNED") throw new DocumentError("Outbound orders can only be removed while the trip is planned.");
      const { count } = await tx.outboundOrder.updateMany({ where: { id: outboundId, tripId }, data: { tripId: null } });
      if (count === 0) throw new DocumentError("That outbound order isn't on this trip.");
      const outbound = await tx.outboundOrder.findUniqueOrThrow({ where: { id: outboundId }, select: { number: true } });
      await logActivity(
        { userId: user.id, entityType: "Trip", entityId: tripId, action: "outbound_removed", message: `${outbound.number} removed from trip ${trip.number}` },
        tx,
      );
    }),
  );
  if (!result.ok) return { error: result.error };

  revalidateTrip(tripId);
  revalidatePath(`/warehouse/outbound/${outboundId}`);
  return undefined;
}

const odometer = (formData: FormData, field: string) => {
  const raw = String(formData.get(field) ?? "").trim();
  const value = Number(raw);
  return raw && Number.isFinite(value) && value >= 0 ? value : null;
};

/** PLANNED → IN_TRANSIT. Records the start time and odometer; the vehicle goes ON_TRIP. */
export async function startTrip(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("trips", "edit");
  const startOdometer = odometer(formData, "startOdometer");
  if (startOdometer === null) return { error: "Enter the start odometer reading." };

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const trip = await tx.trip.findUnique({
        where: { id },
        select: { number: true, vehicleId: true, vehicle: { select: { registrationNo: true, status: true } } },
      });
      if (!trip) throw new DocumentError("Trip not found.");
      const { count } = await tx.trip.updateMany({
        where: { id, status: "PLANNED" },
        data: { status: "IN_TRANSIT", actualStart: new Date(), startOdometer },
      });
      if (count === 0) throw new DocumentError("Only planned trips can be started.");
      const moved = await tx.vehicle.updateMany({ where: { id: trip.vehicleId, status: "AVAILABLE" }, data: { status: "ON_TRIP" } });
      if (moved.count === 0) {
        throw new DocumentError(`${trip.vehicle.registrationNo} isn't available (${trip.vehicle.status.replace("_", " ").toLowerCase()}).`);
      }
      await logActivity(
        {
          userId: user.id,
          entityType: "Trip",
          entityId: id,
          action: "started",
          message: `Trip ${trip.number} started at ${formatNumber(startOdometer, 1)} km`,
        },
        tx,
      );
      return trip.vehicleId;
    }),
  );
  if (!result.ok) return { error: result.error };

  revalidateTrip(id, result.value);
  return undefined;
}

/** IN_TRANSIT → COMPLETED. Records the end time and odometer; the vehicle is AVAILABLE again. */
export async function completeTrip(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("trips", "edit");
  const endOdometer = odometer(formData, "endOdometer");
  if (endOdometer === null) return { error: "Enter the end odometer reading." };

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const trip = await tx.trip.findUnique({ where: { id }, select: { number: true, vehicleId: true, startOdometer: true } });
      if (!trip) throw new DocumentError("Trip not found.");
      const start = num(trip.startOdometer);
      if (endOdometer < start) throw new DocumentError(`End reading can't be below the start reading of ${formatNumber(start, 1)} km.`);
      const { count } = await tx.trip.updateMany({
        where: { id, status: "IN_TRANSIT" },
        data: { status: "COMPLETED", actualEnd: new Date(), endOdometer },
      });
      if (count === 0) throw new DocumentError("Only trips in transit can be completed.");
      await tx.vehicle.updateMany({ where: { id: trip.vehicleId, status: "ON_TRIP" }, data: { status: "AVAILABLE" } });
      await logActivity(
        {
          userId: user.id,
          entityType: "Trip",
          entityId: id,
          action: "completed",
          message: `Trip ${trip.number} completed (${formatNumber(endOdometer - start, 1)} km)`,
        },
        tx,
      );
      return trip.vehicleId;
    }),
  );
  if (!result.ok) return { error: result.error };

  revalidateTrip(id, result.value);
  return undefined;
}

/** PLANNED → CANCELLED. Unloads the outbound orders so they can go on another trip. */
export async function cancelTrip(id: string): Promise<ActionState> {
  const user = await requireUser("trips", "edit");
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const { count } = await tx.trip.updateMany({ where: { id, status: "PLANNED" }, data: { status: "CANCELLED" } });
      if (count === 0) throw new DocumentError("Only planned trips can be cancelled.");
      await tx.outboundOrder.updateMany({ where: { tripId: id }, data: { tripId: null } });
      const trip = await tx.trip.findUniqueOrThrow({ where: { id }, select: { number: true, vehicleId: true } });
      await logActivity({ userId: user.id, entityType: "Trip", entityId: id, action: "cancelled", message: `Trip ${trip.number} cancelled` }, tx);
      return trip.vehicleId;
    }),
  );
  if (!result.ok) return { error: result.error };

  revalidateTrip(id, result.value);
  return undefined;
}
