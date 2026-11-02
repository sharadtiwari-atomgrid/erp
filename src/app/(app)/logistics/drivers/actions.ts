"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { optionalId } from "../_lib/fields";

const driverSchema = z.object({
  name: f.text("Name"),
  phone: f.optionalText(),
  licenseNo: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v.replace(/\s/g, "").toUpperCase() : null)),
  licenseUntil: f.optionalDate(),
  branchId: optionalId(),
  transporterId: optionalId(),
  isActive: f.checkbox(),
});

export async function createDriver(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("fleet", "edit");
  const parsed = parseForm(driverSchema, formData);
  if (!parsed.ok) return parsed.state;

  const driver = await db.$transaction(async (tx) => {
    const created = await tx.driver.create({ data: parsed.data });
    await logActivity({ userId: user.id, entityType: "Driver", entityId: created.id, action: "created", message: `Driver ${created.name} added` }, tx);
    return created;
  });

  revalidatePath("/logistics/drivers");
  redirect(`/logistics/drivers/${driver.id}`);
}

export async function updateDriver(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("fleet", "edit");
  const parsed = parseForm(driverSchema, formData);
  if (!parsed.ok) return parsed.state;

  await db.$transaction(async (tx) => {
    const driver = await tx.driver.update({ where: { id }, data: parsed.data });
    // A deactivated driver can't stay assigned to a vehicle.
    if (!driver.isActive) await tx.driverAssignment.updateMany({ where: { driverId: id, endDate: null }, data: { endDate: new Date() } });
    await logActivity({ userId: user.id, entityType: "Driver", entityId: id, action: "updated", message: `Driver ${driver.name} updated` }, tx);
  });

  revalidatePath("/logistics/drivers");
  revalidatePath(`/logistics/drivers/${id}`);
  redirect(`/logistics/drivers/${id}`);
}
