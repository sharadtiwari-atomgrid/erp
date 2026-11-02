"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ContactRole } from "@/generated/prisma/enums";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { nextDocumentNumber } from "@/lib/sequence";

const contactSchema = z.object({
  name: f.text("Name"),
  contactPerson: f.optionalText(),
  email: f.email(),
  phone: f.optionalText(),
  gstin: f.optionalText(),
  pan: f.optionalText(),
  billingAddress: f.optionalText(),
  shippingAddress: f.optionalText(),
  city: f.optionalText(),
  state: f.optionalText(),
  pincode: f.optionalText(),
  creditLimit: f.number({ label: "Credit limit" }),
  paymentTermsDays: f.int({ label: "Payment terms" }),
  notes: f.optionalText(),
  isActive: f.checkbox(),
});

/** Roles arrive as repeated checkbox values, which parseForm can't express. */
function readRoles(formData: FormData): ContactRole[] {
  const valid = new Set<string>(Object.values(ContactRole));
  return formData.getAll("roles").map(String).filter((r): r is ContactRole => valid.has(r));
}

export async function createContact(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("contacts", "edit");
  const parsed = parseForm(contactSchema, formData);
  if (!parsed.ok) return parsed.state;
  const roles = readRoles(formData);
  if (roles.length === 0) return { fieldErrors: { roles: ["Pick at least one role"] } };

  const contact = await db.$transaction(async (tx) => {
    const code = await nextDocumentNumber(tx, "CONTACT");
    const created = await tx.contact.create({ data: { ...parsed.data, roles, code } });
    await logActivity(
      { userId: user.id, entityType: "Contact", entityId: created.id, action: "created", message: `Contact ${created.name} created` },
      tx,
    );
    return created;
  });

  revalidatePath("/contacts");
  redirect(`/contacts/${contact.id}`);
}

export async function updateContact(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("contacts", "edit");
  const parsed = parseForm(contactSchema, formData);
  if (!parsed.ok) return parsed.state;
  const roles = readRoles(formData);
  if (roles.length === 0) return { fieldErrors: { roles: ["Pick at least one role"] } };

  const contact = await db.contact.update({ where: { id }, data: { ...parsed.data, roles } });
  await logActivity({ userId: user.id, entityType: "Contact", entityId: id, action: "updated", message: `Contact ${contact.name} updated` });

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${id}`);
  redirect(`/contacts/${id}`);
}
