"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { nextDocumentNumber } from "@/lib/sequence";

const supplierSchema = z.object({
  name: f.text("Name"),
  email: f.email(),
  phone: f.optionalText(),
  gstin: f.optionalText(),
  address: f.optionalText(),
  city: f.optionalText(),
  state: f.optionalText(),
  pincode: f.optionalText(),
  paymentTermsDays: f.int({ label: "Payment terms" }),
  notes: f.optionalText(),
  isActive: f.checkbox(),
});

export async function createSupplier(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("suppliers", "edit");
  const parsed = parseForm(supplierSchema, formData);
  if (!parsed.ok) return parsed.state;

  const supplier = await db.$transaction(async (tx) => {
    const code = await nextDocumentNumber(tx, "SUPPLIER");
    const created = await tx.supplier.create({ data: { ...parsed.data, code } });
    await logActivity(
      { userId: user.id, entityType: "Supplier", entityId: created.id, action: "created", message: `Supplier ${created.name} created` },
      tx,
    );
    return created;
  });

  revalidatePath("/purchasing/suppliers");
  redirect(`/purchasing/suppliers/${supplier.id}`);
}

export async function updateSupplier(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("suppliers", "edit");
  const parsed = parseForm(supplierSchema, formData);
  if (!parsed.ok) return parsed.state;

  const supplier = await db.supplier.update({ where: { id }, data: parsed.data });
  await logActivity({ userId: user.id, entityType: "Supplier", entityId: id, action: "updated", message: `Supplier ${supplier.name} updated` });

  revalidatePath("/purchasing/suppliers");
  revalidatePath(`/purchasing/suppliers/${id}`);
  redirect(`/purchasing/suppliers/${id}`);
}
