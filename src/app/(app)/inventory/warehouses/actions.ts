"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { f, parseForm, type ActionState } from "@/lib/forms";

const warehouseSchema = z.object({
  code: f.text("Code").transform((v) => v.toUpperCase()),
  name: f.text("Name"),
  branchId: f.id("Branch"),
  address: f.optionalText(),
  isActive: f.checkbox(),
});

const codeTaken: ActionState = {
  error: "Please fix the highlighted fields.",
  fieldErrors: { code: ["Another warehouse already uses this code"] },
};

export async function createWarehouse(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("warehouses", "edit");
  const parsed = parseForm(warehouseSchema, formData);
  if (!parsed.ok) return parsed.state;

  if (await db.warehouse.findUnique({ where: { code: parsed.data.code }, select: { id: true } })) return codeTaken;

  const warehouse = await db.$transaction(async (tx) => {
    const created = await tx.warehouse.create({ data: parsed.data });
    await logActivity(
      { userId: user.id, entityType: "Warehouse", entityId: created.id, action: "created", message: `Warehouse ${created.code} ${created.name} created` },
      tx,
    );
    return created;
  });

  revalidatePath("/inventory/warehouses");
  redirect(`/inventory/warehouses/${warehouse.id}`);
}

export async function updateWarehouse(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("warehouses", "edit");
  const parsed = parseForm(warehouseSchema, formData);
  if (!parsed.ok) return parsed.state;

  if (await db.warehouse.findFirst({ where: { code: parsed.data.code, id: { not: id } }, select: { id: true } })) return codeTaken;

  const warehouse = await db.warehouse.update({ where: { id }, data: parsed.data });
  await logActivity({ userId: user.id, entityType: "Warehouse", entityId: id, action: "updated", message: `Warehouse ${warehouse.code} ${warehouse.name} updated` });

  revalidatePath("/inventory/warehouses");
  revalidatePath(`/inventory/warehouses/${id}`);
  redirect(`/inventory/warehouses/${id}`);
}
