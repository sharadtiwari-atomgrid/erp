"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ContactRole } from "@/generated/prisma/enums";
import { diff, recordChange } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { nextDocumentNumber } from "@/lib/sequence";
import { describeRename, liveUsage, renameContactEverywhere } from "./rename";

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
  multipleAddresses: f.checkbox(),
});

/** Roles arrive as repeated checkbox values, which parseForm can't express. */
function readRoles(formData: FormData): ContactRole[] {
  const valid = new Set<string>(Object.values(ContactRole));
  return formData.getAll("roles").map(String).filter((r): r is ContactRole => valid.has(r));
}

/** POC names: one per line (commas and semicolons also separate), trimmed, de-duplicated case-insensitively. */
function readPocNames(raw: FormDataEntryValue | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of String(raw ?? "").split(/[\n,;]+/)) {
    const name = part.replace(/\s+/g, " ").trim();
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      out.push(name);
    }
  }
  return out;
}

async function readContact(formData: FormData) {
  const parsed = parseForm(contactSchema, formData);
  if (!parsed.ok) return { ok: false as const, state: parsed.state };
  const roles = readRoles(formData);
  if (roles.length === 0) return { ok: false as const, state: { fieldErrors: { roles: ["Pick at least one role"] } } };
  if (roles.includes("TRANSPORTER") && !parsed.data.gstin) {
    return { ok: false as const, state: { error: "Please fix the highlighted fields.", fieldErrors: { gstin: ["Transporter ID (GSTIN) is required for a transporter"] } } };
  }
  const pocNames = readPocNames(formData.get("pocNames"));
  return { ok: true as const, data: { ...parsed.data, roles, pocNames } };
}

export async function createContact(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("contacts", "edit");
  const read = await readContact(formData);
  if (!read.ok) return read.state;

  const contact = await db.$transaction(async (tx) => {
    const code = await nextDocumentNumber(tx, "CONTACT");
    const created = await tx.contact.create({ data: { ...read.data, code } });
    await recordChange(
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
  const read = await readContact(formData);
  if (!read.ok) return read.state;
  const before = await db.contact.findUnique({ where: { id } });
  if (!before) return { error: "This contact no longer exists." };
  const data = read.data;

  // Deactivating is blocked while live Fresh POs / MIS jobs still use the name.
  if (before.isActive && !data.isActive) {
    const u = await liveUsage(before.name);
    if (u.po || u.mis) {
      return {
        error: `“${before.name}” is still used on ${u.mis} Domestic MIS job${u.mis === 1 ? "" : "s"} and ${u.po} Fresh PO${u.po === 1 ? "" : "s"}. Rename it instead, or change those first.`,
        fieldErrors: { isActive: ["Still in use"] },
      };
    }
  }

  const renamed = data.name !== before.name;
  // Another contact with the same old name keeps the text on the records.
  const shared = renamed ? await db.contact.count({ where: { name: before.name, id: { not: id } } }) : 0;
  let note = "";
  await db.$transaction(async (tx) => {
    const after = await tx.contact.update({ where: { id }, data });
    if (renamed && !shared) note = describeRename(await renameContactEverywhere(tx, before.name, data.name));
    else if (renamed) note = "Another contact has the old name too, so Domestic B2B records were left unchanged.";
    await recordChange(
      {
        userId: user.id,
        entityType: "Contact",
        entityId: id,
        action: renamed ? "renamed" : "updated",
        message: renamed ? `Contact renamed from ${before.name} to ${after.name}. ${note}` : `Contact ${after.name} updated`,
        changes: diff(before, after),
      },
      tx,
    );
  });

  revalidatePath("/contacts");
  revalidatePath(`/contacts/${id}`);
  if (renamed) {
    revalidatePath("/b2b", "layout");
    redirect(`/contacts/${id}?renamed=${encodeURIComponent(note)}`);
  }
  redirect(`/contacts/${id}`);
}
