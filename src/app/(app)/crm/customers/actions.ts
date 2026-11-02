"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { nextDocumentNumber } from "@/lib/sequence";

const customerSchema = z.object({
  name: f.text("Name"),
  email: f.email(),
  phone: f.optionalText(),
  gstin: f.optionalText(),
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

export async function createCustomer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("customers", "edit");
  const parsed = parseForm(customerSchema, formData);
  if (!parsed.ok) return parsed.state;

  const customer = await db.$transaction(async (tx) => {
    const code = await nextDocumentNumber(tx, "CUSTOMER");
    const created = await tx.customer.create({ data: { ...parsed.data, code } });
    await logActivity(
      { userId: user.id, entityType: "Customer", entityId: created.id, action: "created", message: `Customer ${created.name} created` },
      tx,
    );
    return created;
  });

  revalidatePath("/crm/customers");
  redirect(`/crm/customers/${customer.id}`);
}

export async function updateCustomer(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("customers", "edit");
  const parsed = parseForm(customerSchema, formData);
  if (!parsed.ok) return parsed.state;

  const customer = await db.customer.update({ where: { id }, data: parsed.data });
  await logActivity({ userId: user.id, entityType: "Customer", entityId: id, action: "updated", message: `Customer ${customer.name} updated` });

  revalidatePath("/crm/customers");
  revalidatePath(`/crm/customers/${id}`);
  redirect(`/crm/customers/${id}`);
}
