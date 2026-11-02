"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { humanize } from "@/lib/format";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { can } from "@/lib/permissions";
import { nextDocumentNumber } from "@/lib/sequence";
import type { LeadStatus } from "@/generated/prisma/enums";

const leadSchema = z.object({
  name: f.text("Name"),
  company: f.optionalText(),
  email: f.email(),
  phone: f.optionalText(),
  source: f.optionalText(),
  estimatedValue: f.number({ label: "Estimated value" }),
  ownerId: f.optionalText(),
  notes: f.optionalText(),
});

/** Statuses a user can move an open lead to. CONVERTED is only set by convertLead. */
const MANUAL_STATUSES: LeadStatus[] = ["NEW", "CONTACTED", "QUALIFIED", "LOST"];

export async function createLead(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("leads", "edit");
  const parsed = parseForm(leadSchema, formData);
  if (!parsed.ok) return parsed.state;

  const lead = await db.$transaction(async (tx) => {
    const created = await tx.lead.create({ data: { ...parsed.data, ownerId: parsed.data.ownerId ?? user.id } });
    await logActivity(
      { userId: user.id, entityType: "Lead", entityId: created.id, action: "created", message: `Lead ${created.name} created` },
      tx,
    );
    return created;
  });

  revalidatePath("/crm/leads");
  redirect(`/crm/leads/${lead.id}`);
}

export async function updateLead(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("leads", "edit");
  const parsed = parseForm(leadSchema, formData);
  if (!parsed.ok) return parsed.state;

  const lead = await db.lead.update({ where: { id }, data: parsed.data });
  await logActivity({ userId: user.id, entityType: "Lead", entityId: id, action: "updated", message: `Lead ${lead.name} updated` });

  revalidatePath("/crm/leads");
  revalidatePath(`/crm/leads/${id}`);
  redirect(`/crm/leads/${id}`);
}

export async function setLeadStatus(id: string, status: LeadStatus): Promise<ActionState> {
  const user = await requireUser("leads", "edit");
  if (!MANUAL_STATUSES.includes(status)) return { error: "Use Convert to customer to convert a lead." };

  const lead = await db.lead.findUnique({ where: { id }, select: { name: true, status: true } });
  if (!lead) return { error: "Lead not found." };
  if (lead.status === "CONVERTED") return { error: "This lead has already been converted." };
  if (lead.status === status) return undefined;

  await db.$transaction(async (tx) => {
    await tx.lead.update({ where: { id }, data: { status } });
    await logActivity(
      { userId: user.id, entityType: "Lead", entityId: id, action: "status", message: `Lead ${lead.name} marked ${humanize(status).toLowerCase()}` },
      tx,
    );
  });

  revalidatePath("/crm/leads");
  revalidatePath(`/crm/leads/${id}`);
  return undefined;
}

/** Creates a customer from the lead and marks the lead CONVERTED. */
export async function convertLead(id: string): Promise<ActionState> {
  const user = await requireUser("leads", "edit");
  if (!can(user.role, "customers", "edit")) return { error: "You don’t have permission to create customers." };

  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) return { error: "Lead not found." };
  if (lead.status === "CONVERTED") return { error: "This lead has already been converted." };

  const customer = await db.$transaction(async (tx) => {
    const code = await nextDocumentNumber(tx, "CUSTOMER");
    const created = await tx.customer.create({
      data: {
        code,
        name: lead.company ?? lead.name,
        email: lead.email,
        phone: lead.phone,
        notes: [lead.company ? `Contact: ${lead.name}` : null, lead.notes].filter(Boolean).join("\n") || null,
      },
    });
    await tx.lead.update({ where: { id }, data: { status: "CONVERTED", customerId: created.id } });
    await logActivity(
      { userId: user.id, entityType: "Customer", entityId: created.id, action: "created", message: `Customer ${created.name} created from lead` },
      tx,
    );
    await logActivity(
      { userId: user.id, entityType: "Lead", entityId: id, action: "converted", message: `Lead ${lead.name} converted to customer ${created.code}` },
      tx,
    );
    return created;
  });

  revalidatePath("/crm/leads");
  revalidatePath(`/crm/leads/${id}`);
  revalidatePath("/crm/customers");
  redirect(`/crm/customers/${customer.id}`);
}
