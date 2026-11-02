"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ShippingDocType } from "@/generated/prisma/enums";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db, type Tx } from "@/lib/db";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { nextDocumentNumber } from "@/lib/sequence";
import { parseIstDateTime } from "../../books/_lib/eway";
import { attempt } from "../../sales/_lib/attempt";
import { DocumentError } from "../../sales/_lib/documents";

const LABEL: Record<ShippingDocType, string> = { ASN: "ASN", DN: "Delivery note" };

function revalidateDocs(opts: { id?: string; tripId?: string | null; outboundId?: string | null }) {
  revalidatePath("/logistics/documents");
  if (opts.id) revalidatePath(`/logistics/documents/${opts.id}`);
  if (opts.tripId) revalidatePath(`/logistics/trips/${opts.tripId}`);
  if (opts.outboundId) revalidatePath(`/warehouse/outbound/${opts.outboundId}`);
}

/**
 * Creates one ASN or DN for an outbound order. The customer comes from the
 * outbound's sales order and the trip from the outbound. One document of each
 * type per outbound.
 */
async function createForOutbound(
  tx: Tx,
  input: { type: ShippingDocType; outboundId: string; expectedDelivery: Date | null; notes: string | null; userId: string },
) {
  const outbound = await tx.outboundOrder.findUnique({
    where: { id: input.outboundId },
    select: { number: true, status: true, tripId: true, salesOrder: { select: { customerId: true } } },
  });
  if (!outbound) throw new DocumentError("Outbound order not found.");
  if (outbound.status !== "PACKED" && outbound.status !== "DISPATCHED") {
    throw new DocumentError(`${outbound.number} must be packed or dispatched first.`);
  }
  const existing = await tx.shippingDocument.findFirst({ where: { outboundId: input.outboundId, type: input.type }, select: { number: true } });
  if (existing) throw new DocumentError(`${outbound.number} already has ${LABEL[input.type]} ${existing.number}.`);

  const number = await nextDocumentNumber(tx, input.type === "ASN" ? "ASN" : "DELIVERY_NOTE");
  const doc = await tx.shippingDocument.create({
    data: {
      number,
      type: input.type,
      outboundId: input.outboundId,
      tripId: outbound.tripId,
      customerId: outbound.salesOrder.customerId,
      expectedDelivery: input.expectedDelivery,
      notes: input.notes,
    },
  });
  await logActivity(
    { userId: input.userId, entityType: "ShippingDocument", entityId: doc.id, action: "created", message: `${LABEL[input.type]} ${number} generated for ${outbound.number}` },
    tx,
  );
  if (outbound.tripId) {
    await logActivity(
      { userId: input.userId, entityType: "Trip", entityId: outbound.tripId, action: "document", message: `${LABEL[input.type]} ${number} generated for ${outbound.number}` },
      tx,
    );
  }
  return doc;
}

const docSchema = z.object({
  type: z.enum(ShippingDocType, { error: "Choose ASN or delivery note" }),
  outboundId: f.id("Outbound order"),
  expectedDelivery: z
    .string()
    .optional()
    .transform((v) => (v ? parseIstDateTime(v) : null)),
  notes: f.optionalText(),
});

export async function createShippingDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("trips", "edit");
  const parsed = parseForm(docSchema, formData);
  if (!parsed.ok) return parsed.state;

  const result = await attempt(() => db.$transaction((tx) => createForOutbound(tx, { ...parsed.data, userId: user.id })));
  if (!result.ok) return { error: result.error };

  revalidateDocs({ id: result.value.id, tripId: result.value.tripId, outboundId: result.value.outboundId });
  redirect(`/logistics/documents/${result.value.id}`);
}

/** Generates an ASN or DN for every outbound on the trip that doesn't have one yet. */
export async function generateTripDocuments(tripId: string, type: ShippingDocType, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("trips", "edit");
  const raw = String(formData.get("expectedDelivery") ?? "");
  const expectedDelivery = raw ? parseIstDateTime(raw) : null;

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const trip = await tx.trip.findUnique({
        where: { id: tripId },
        select: { status: true, outbounds: { select: { id: true, shippingDocs: { where: { type }, select: { id: true } } } } },
      });
      if (!trip) throw new DocumentError("Trip not found.");
      if (trip.status === "CANCELLED") throw new DocumentError("This trip is cancelled.");
      const pending = trip.outbounds.filter((o) => o.shippingDocs.length === 0);
      if (pending.length === 0) throw new DocumentError(`Every outbound on this trip already has a${type === "ASN" ? "n ASN" : " delivery note"}.`);
      for (const o of pending) await createForOutbound(tx, { type, outboundId: o.id, expectedDelivery, notes: null, userId: user.id });
      return pending.length;
    }),
  );
  if (!result.ok) return { error: result.error };

  revalidateDocs({ tripId });
  return { success: `${result.value} ${LABEL[type].toLowerCase()}${result.value === 1 ? "" : "s"} generated.` };
}

const deliveredSchema = z.object({
  deliveredAt: z
    .string()
    .min(1, "Enter the delivery time")
    .transform((v, ctx) => {
      const d = parseIstDateTime(v);
      if (!d) ctx.addIssue({ code: "custom", message: "Enter a valid delivery time" });
      return d ?? new Date(NaN);
    }),
  receivedBy: f.text("Received by"),
});

/** Records proof of delivery on a delivery note. */
export async function markDelivered(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("trips", "edit");
  const parsed = parseForm(deliveredSchema, formData);
  if (!parsed.ok) return parsed.state;

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const { count } = await tx.shippingDocument.updateMany({ where: { id, type: "DN", deliveredAt: null }, data: parsed.data });
      if (count === 0) throw new DocumentError("This delivery note is already marked delivered.");
      const doc = await tx.shippingDocument.findUniqueOrThrow({ where: { id }, select: { number: true, tripId: true, outboundId: true } });
      await logActivity(
        { userId: user.id, entityType: "ShippingDocument", entityId: id, action: "delivered", message: `${doc.number} delivered, received by ${parsed.data.receivedBy}` },
        tx,
      );
      if (doc.tripId) {
        await logActivity(
          { userId: user.id, entityType: "Trip", entityId: doc.tripId, action: "delivered", message: `${doc.number} delivered, received by ${parsed.data.receivedBy}` },
          tx,
        );
      }
      return doc;
    }),
  );
  if (!result.ok) return { error: result.error };

  revalidateDocs({ id, tripId: result.value.tripId, outboundId: result.value.outboundId });
  return { success: "Marked delivered." };
}
