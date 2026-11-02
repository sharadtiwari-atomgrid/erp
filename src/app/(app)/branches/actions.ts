"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { f, parseForm, type ActionState } from "@/lib/forms";

const branchSchema = z.object({
  code: f.text("Code").transform((v) => v.toUpperCase()),
  name: f.text("Name"),
  gstin: f.optionalText(),
  phone: f.optionalText(),
  address: f.optionalText(),
  city: f.optionalText(),
  state: f.optionalText(),
  pincode: f.optionalText(),
  isActive: f.checkbox(),
});

const codeTaken: ActionState = { fieldErrors: { code: ["Another branch already uses this code"] } };

export async function createBranch(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("branches", "edit");
  const parsed = parseForm(branchSchema, formData);
  if (!parsed.ok) return parsed.state;
  if (await db.branch.findUnique({ where: { code: parsed.data.code } })) return codeTaken;

  const branch = await db.branch.create({ data: parsed.data });
  await logActivity({ userId: user.id, entityType: "Branch", entityId: branch.id, action: "created", message: `Branch ${branch.code} ${branch.name} created` });
  revalidatePath("/branches");
  redirect(`/branches/${branch.id}`);
}

export async function updateBranch(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("branches", "edit");
  const parsed = parseForm(branchSchema, formData);
  if (!parsed.ok) return parsed.state;
  if (await db.branch.findFirst({ where: { code: parsed.data.code, NOT: { id } } })) return codeTaken;

  const branch = await db.branch.update({ where: { id }, data: parsed.data });
  await logActivity({ userId: user.id, entityType: "Branch", entityId: id, action: "updated", message: `Branch ${branch.code} updated` });
  revalidatePath("/branches");
  revalidatePath(`/branches/${id}`);
  redirect(`/branches/${id}`);
}
