"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { f, parseForm, type ActionState } from "@/lib/forms";

const companySchema = z.object({
  name: f.text("Company name"),
  legalName: f.optionalText(),
  gstin: f.optionalText(),
  pan: f.optionalText(),
  email: f.email(),
  phone: f.optionalText(),
  address: f.optionalText(),
  city: f.optionalText(),
  state: f.optionalText(),
  pincode: f.optionalText(),
  currency: z.string().trim().length(3, "Use a 3-letter currency code").toUpperCase(),
});

export async function updateCompany(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("settings", "edit");
  const parsed = parseForm(companySchema, formData);
  if (!parsed.ok) return parsed.state;

  await db.companySettings.upsert({ where: { id: 1 }, create: { id: 1, ...parsed.data }, update: parsed.data });
  await logActivity({ userId: user.id, entityType: "CompanySettings", entityId: "1", action: "updated", message: "Company settings updated" });

  revalidatePath("/", "layout");
  return { success: "Company settings saved." };
}
