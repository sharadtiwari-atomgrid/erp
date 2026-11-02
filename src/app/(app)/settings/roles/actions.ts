"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { MODULES, type Module, type Permissions } from "@/lib/permissions";

const roleSchema = z.object({
  name: f.text("Name"),
  description: f.optionalText(),
  fullAccess: f.checkbox(),
});

/** Each module posts a `perm.<module>` radio value of none/view/edit. */
function readPermissions(formData: FormData): Permissions {
  const out: Permissions = {};
  for (const module of Object.keys(MODULES) as Module[]) {
    const level = formData.get(`perm.${module}`);
    if (level === "view" || level === "edit") out[module] = level;
  }
  return out;
}

export async function createRole(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("settings", "edit");
  const parsed = parseForm(roleSchema, formData);
  if (!parsed.ok) return parsed.state;
  if (await db.accessRole.findUnique({ where: { name: parsed.data.name } })) {
    return { fieldErrors: { name: ["A role with this name already exists"] } };
  }
  const role = await db.accessRole.create({ data: { ...parsed.data, permissions: readPermissions(formData) } });
  await logActivity({ userId: user.id, entityType: "AccessRole", entityId: role.id, action: "created", message: `Role ${role.name} created` });
  revalidatePath("/settings/roles");
  redirect("/settings/roles");
}

export async function updateRole(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("settings", "edit");
  const parsed = parseForm(roleSchema, formData);
  if (!parsed.ok) return parsed.state;

  const clash = await db.accessRole.findFirst({ where: { name: parsed.data.name, NOT: { id } } });
  if (clash) return { fieldErrors: { name: ["A role with this name already exists"] } };

  // Never let an admin lock everyone out by stripping full access from the last admin role.
  const current = await db.accessRole.findUniqueOrThrow({ where: { id } });
  if (current.fullAccess && !parsed.data.fullAccess) {
    const otherAdmins = await db.accessRole.count({ where: { fullAccess: true, NOT: { id }, users: { some: { isActive: true } } } });
    if (otherAdmins === 0) return { error: "At least one role with full access must keep an active user." };
  }

  const role = await db.accessRole.update({ where: { id }, data: { ...parsed.data, permissions: readPermissions(formData) } });
  await logActivity({ userId: user.id, entityType: "AccessRole", entityId: id, action: "updated", message: `Role ${role.name} updated` });
  revalidatePath("/settings/roles");
  redirect("/settings/roles");
}

export async function deleteRole(id: string): Promise<ActionState> {
  const user = await requireUser("settings", "edit");
  const role = await db.accessRole.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
  if (!role) return { error: "Role not found." };
  if (role.isSystem) return { error: "Built-in roles can't be deleted." };
  if (role._count.users > 0) return { error: "Move this role's users to another role first." };
  await db.accessRole.delete({ where: { id } });
  await logActivity({ userId: user.id, entityType: "AccessRole", entityId: id, action: "deleted", message: `Role ${role.name} deleted` });
  revalidatePath("/settings/roles");
  redirect("/settings/roles");
}
