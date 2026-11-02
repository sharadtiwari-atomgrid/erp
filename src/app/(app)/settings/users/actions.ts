"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { f, parseForm, type ActionState } from "@/lib/forms";

const baseSchema = {
  name: f.text("Name"),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
  roleId: f.id("Role"),
  branchId: f.optionalText(),
  isActive: f.checkbox(),
};

const createSchema = z.object({
  ...baseSchema,
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const updateSchema = z.object({
  ...baseSchema,
  password: z
    .string()
    .optional()
    .transform((v) => v || undefined)
    .pipe(z.string().min(8, "Password must be at least 8 characters").optional()),
});

export async function createUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireUser("settings", "edit");
  const parsed = parseForm(createSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { password, ...data } = parsed.data;

  if (await db.user.findUnique({ where: { email: data.email } })) {
    return { fieldErrors: { email: ["A user with this email already exists"] } };
  }

  const user = await db.user.create({ data: { ...data, passwordHash: await bcrypt.hash(password, 10) } });
  await logActivity({ userId: admin.id, entityType: "User", entityId: user.id, action: "created", message: `User ${user.name} added` });

  revalidatePath("/settings/users");
  redirect("/settings/users");
}

export async function updateUser(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireUser("settings", "edit");
  const parsed = parseForm(updateSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { password, ...data } = parsed.data;

  if (id === admin.id) {
    const role = await db.accessRole.findUnique({ where: { id: data.roleId }, select: { fullAccess: true } });
    if (!role?.fullAccess || !data.isActive) return { error: "You can't remove your own admin access or deactivate yourself." };
  }
  const clash = await db.user.findFirst({ where: { email: data.email, NOT: { id } } });
  if (clash) return { fieldErrors: { email: ["A user with this email already exists"] } };

  const user = await db.user.update({
    where: { id },
    data: { ...data, ...(password && { passwordHash: await bcrypt.hash(password, 10) }) },
  });
  await logActivity({ userId: admin.id, entityType: "User", entityId: id, action: "updated", message: `User ${user.name} updated` });

  revalidatePath("/settings/users");
  redirect("/settings/users");
}
