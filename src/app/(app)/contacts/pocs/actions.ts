"use server";

import { revalidatePath } from "next/cache";
import { diff, recordChange } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import type { ActionState } from "@/lib/forms";

const clean = (v: FormDataEntryValue | null) => String(v ?? "").replace(/\s+/g, " ").trim();

async function existing(name: string, exceptId?: string) {
  return db.opsPoc.findFirst({ where: { name: { equals: name, mode: "insensitive" }, ...(exceptId && { id: { not: exceptId } }) } });
}

export async function addPoc(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("contacts", "edit");
  const name = clean(formData.get("name"));
  if (!name) return { fieldErrors: { name: ["Enter a name"] } };
  if (name.length > 120) return { fieldErrors: { name: ["Keep it under 120 characters"] } };
  const dup = await existing(name);
  if (dup) return { error: `“${dup.name}” is already in the list.` };
  const poc = await db.opsPoc.create({ data: { name } });
  await recordChange({ userId: user.id, entityType: "OpsPoc", entityId: poc.id, action: "created", message: `POC ${name} added` });
  revalidatePath("/contacts/pocs");
  return { success: `Added ${name}.` };
}

export async function renamePoc(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("contacts", "edit");
  const name = clean(formData.get("name"));
  if (!name) return { error: "Enter a name." };
  const before = await db.opsPoc.findUnique({ where: { id } });
  if (!before) return { error: "This POC no longer exists." };
  if (before.name === name) return undefined;
  const dup = await existing(name, id);
  if (dup) return { error: `“${dup.name}” is already in the list.` };
  const after = await db.opsPoc.update({ where: { id }, data: { name } });
  await recordChange({ userId: user.id, entityType: "OpsPoc", entityId: id, action: "updated", message: `POC renamed to ${name}`, changes: diff(before, after) });
  revalidatePath("/contacts/pocs");
  return undefined;
}

export async function deletePoc(id: string): Promise<ActionState> {
  const user = await requireUser("contacts", "edit");
  const poc = await db.opsPoc.findUnique({ where: { id } });
  if (!poc) return undefined;
  await db.opsPoc.delete({ where: { id } });
  await recordChange({ userId: user.id, entityType: "OpsPoc", entityId: id, action: "deleted", message: `POC ${poc.name} deleted` });
  revalidatePath("/contacts/pocs");
  return undefined;
}
