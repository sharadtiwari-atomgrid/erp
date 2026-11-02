"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { MachineStatus } from "@/generated/prisma/enums";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { attempt, isUniqueViolation, MfgError, readWeekdays } from "../_lib/server";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const unitSchema = z
  .object({
    code: f.text("Code").transform((v) => v.toUpperCase()),
    name: f.text("Name"),
    branchId: f.id("Branch"),
    address: f.optionalText(),
    shiftsPerDay: f.int({ min: 1, label: "Shifts per day" }).max(4, "At most 4 shifts per day"),
    shiftStart: z.string().trim().regex(HHMM, "Use 24-hour HH:mm, e.g. 07:00"),
    shiftHours: f.number({ min: 0.5, label: "Shift hours" }).max(24, "A shift cannot exceed 24 hours"),
    notes: f.optionalText(),
    isActive: f.checkbox(),
  })
  .refine((d) => d.shiftsPerDay * d.shiftHours <= 24, {
    path: ["shiftHours"],
    message: "Shifts per day × shift hours cannot exceed 24",
  });

function revalidateHub() {
  revalidatePath("/manufacturing/hub");
  revalidatePath("/manufacturing/hub/machines");
  revalidatePath("/manufacturing/schedule");
}

function readUnit(formData: FormData) {
  const parsed = parseForm(unitSchema, formData);
  if (!parsed.ok) return parsed;
  const workingDays = readWeekdays(formData);
  if (workingDays.length === 0) return { ok: false as const, state: { fieldErrors: { workingDays: ["Pick at least one working day"] } } };
  return { ok: true as const, data: { ...parsed.data, workingDays } };
}

export async function createUnit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("hubSettings", "edit");
  const parsed = readUnit(formData);
  if (!parsed.ok) return parsed.state;
  let id: string;
  try {
    id = await db.$transaction(async (tx) => {
      const unit = await tx.productionUnit.create({ data: parsed.data });
      await logActivity(
        { userId: user.id, entityType: "ProductionUnit", entityId: unit.id, action: "created", message: `Production unit ${unit.name} created` },
        tx,
      );
      return unit.id;
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { fieldErrors: { code: ["This code is already used"] } };
    throw e;
  }
  revalidateHub();
  redirect(`/manufacturing/hub/units/${id}`);
}

export async function updateUnit(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("hubSettings", "edit");
  const parsed = readUnit(formData);
  if (!parsed.ok) return parsed.state;
  try {
    const unit = await db.productionUnit.update({ where: { id }, data: parsed.data });
    await logActivity({ userId: user.id, entityType: "ProductionUnit", entityId: id, action: "updated", message: `Production unit ${unit.name} updated` });
  } catch (e) {
    if (isUniqueViolation(e)) return { fieldErrors: { code: ["This code is already used"] } };
    throw e;
  }
  revalidateHub();
  revalidatePath(`/manufacturing/hub/units/${id}`);
  redirect(`/manufacturing/hub/units/${id}`);
}

export async function deleteUnit(id: string): Promise<ActionState> {
  await requireUser("hubSettings", "edit");
  const result = await attempt(async () => {
    const machines = await db.machine.count({ where: { productionUnitId: id } });
    if (machines > 0) throw new MfgError("Move or delete this unit's machines first, or mark the unit inactive.");
    await db.productionUnit.deleteMany({ where: { id } });
  });
  if (result?.error) return result;
  revalidateHub();
  redirect("/manufacturing/hub");
}

const machineSchema = z.object({
  code: f.text("Code").transform((v) => v.toUpperCase()),
  name: f.text("Name"),
  type: f.optionalText(),
  productionUnitId: f.id("Production unit"),
  hoursPerDay: f.number({ min: 0, label: "Hours per day" }).max(24, "At most 24 hours per day"),
  hourlyCost: f.number({ label: "Hourly cost" }),
  status: z.enum(MachineStatus),
  notes: f.optionalText(),
});

export async function createMachine(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("hubSettings", "edit");
  const parsed = parseForm(machineSchema, formData);
  if (!parsed.ok) return parsed.state;
  let id: string;
  try {
    id = await db.$transaction(async (tx) => {
      const machine = await tx.machine.create({ data: parsed.data });
      await logActivity(
        { userId: user.id, entityType: "Machine", entityId: machine.id, action: "created", message: `Machine ${machine.code} created` },
        tx,
      );
      return machine.id;
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { fieldErrors: { code: ["This code is already used"] } };
    throw e;
  }
  revalidateHub();
  redirect(`/manufacturing/hub/machines/${id}`);
}

export async function updateMachine(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("hubSettings", "edit");
  const parsed = parseForm(machineSchema, formData);
  if (!parsed.ok) return parsed.state;
  try {
    const before = await db.machine.findUniqueOrThrow({ where: { id }, select: { status: true } });
    const machine = await db.machine.update({ where: { id }, data: parsed.data });
    const statusNote = before.status !== machine.status ? ` (status ${before.status.toLowerCase()} → ${machine.status.toLowerCase()})` : "";
    await logActivity({
      userId: user.id,
      entityType: "Machine",
      entityId: id,
      action: before.status !== machine.status ? machine.status.toLowerCase() : "updated",
      message: `Machine ${machine.code} updated${statusNote}`,
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { fieldErrors: { code: ["This code is already used"] } };
    throw e;
  }
  revalidateHub();
  revalidatePath(`/manufacturing/hub/machines/${id}`);
  redirect(`/manufacturing/hub/machines/${id}`);
}

export async function deleteMachine(id: string): Promise<ActionState> {
  await requireUser("hubSettings", "edit");
  const result = await attempt(async () => {
    const [ops, slots] = await Promise.all([
      db.bomOperation.count({ where: { machineId: id } }),
      db.productionScheduleSlot.count({ where: { machineId: id } }),
    ]);
    if (ops > 0 || slots > 0) {
      throw new MfgError("This machine is used by BOM operations or the schedule. Mark it inactive instead.");
    }
    await db.machine.deleteMany({ where: { id } });
  });
  if (result?.error) return result;
  revalidateHub();
  redirect("/manufacturing/hub/machines");
}
