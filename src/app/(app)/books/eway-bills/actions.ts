"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { isUniqueViolation, optionalId } from "../../logistics/_lib/fields";
import { attempt } from "../../sales/_lib/attempt";
import { DocumentError } from "../../sales/_lib/documents";
import { canCancelEwb, ewayValidUntil, isValidEwbNumber, normaliseEwbNumber, parseIstDateTime } from "../_lib/eway";

const ELIGIBLE = ["ISSUED", "PARTIALLY_PAID", "PAID"] as const;

const ewbSchema = z
  .object({
    number: z
      .string()
      .trim()
      .refine(isValidEwbNumber, "E-way bill number must be exactly 12 digits")
      .transform(normaliseEwbNumber),
    invoiceId: f.id("Invoice"),
    vehicleId: optionalId(),
    vehicleNo: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v.replace(/[\s-]/g, "").toUpperCase() : null)),
    transporterId: optionalId(),
    fromPlace: f.text("From place"),
    toPlace: f.text("To place"),
    distanceKm: f.int({ min: 1, label: "Distance" }).refine((v) => v >= 1 && v <= 4000, "Distance must be between 1 and 4000 km"),
    generatedAt: z.string().transform((v, ctx) => {
      const d = parseIstDateTime(v);
      if (!d) ctx.addIssue({ code: "custom", message: "Enter the generation date and time" });
      return d ?? new Date(NaN);
    }),
    notes: f.optionalText(),
  })
  .refine((v) => !!v.vehicleId || !!v.vehicleNo, { path: ["vehicleNo"], message: "Pick a vehicle or type its number" })
  .refine((v) => Number.isNaN(v.generatedAt.getTime()) || v.generatedAt.getTime() <= Date.now() + 5 * 60_000, {
    path: ["generatedAt"],
    message: "Generation time can't be in the future",
  });

function revalidateEwb(id: string, invoiceId: string) {
  revalidatePath("/books/eway-bills");
  revalidatePath(`/books/eway-bills/${id}`);
  revalidatePath(`/sales/invoices/${invoiceId}`);
}

export async function createEwayBill(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("eWayBills", "edit");
  const parsed = parseForm(ewbSchema, formData);
  if (!parsed.ok) return parsed.state;
  const data = parsed.data;

  const [invoice, vehicle] = await Promise.all([
    db.invoice.findUnique({ where: { id: data.invoiceId }, select: { number: true, status: true } }),
    data.vehicleId ? db.vehicle.findUnique({ where: { id: data.vehicleId }, select: { transporterId: true } }) : null,
  ]);
  if (!invoice) return { fieldErrors: { invoiceId: ["Invoice not found"] } };
  if (!(ELIGIBLE as readonly string[]).includes(invoice.status)) {
    return { fieldErrors: { invoiceId: ["E-way bills can only be recorded against issued invoices"] } };
  }

  const validUntil = ewayValidUntil(data.generatedAt, data.distanceKm);
  let id: string;
  try {
    id = await db.$transaction(async (tx) => {
      const bill = await tx.eWayBill.create({
        data: {
          ...data,
          vehicleNo: data.vehicleId ? null : data.vehicleNo,
          transporterId: data.transporterId ?? vehicle?.transporterId ?? null,
          validUntil,
        },
      });
      const message = `E-way bill ${bill.number} recorded for ${invoice.number}, valid until ${formatDateTime(validUntil)}`;
      await logActivity({ userId: user.id, entityType: "EWayBill", entityId: bill.id, action: "created", message }, tx);
      await logActivity({ userId: user.id, entityType: "Invoice", entityId: data.invoiceId, action: "eway_bill", message }, tx);
      return bill.id;
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { fieldErrors: { number: ["This e-way bill number is already recorded"] } };
    throw e;
  }

  revalidateEwb(id, data.invoiceId);
  redirect(`/books/eway-bills/${id}`);
}

/** ACTIVE → CANCELLED, only within 24 hours of generation (as on the GST portal). */
export async function cancelEwayBill(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("eWayBills", "edit");
  const reason = String(formData.get("reason") ?? "").trim();

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const bill = await tx.eWayBill.findUnique({ where: { id }, select: { number: true, status: true, generatedAt: true, validUntil: true, invoiceId: true, notes: true } });
      if (!bill) throw new DocumentError("E-way bill not found.");
      if (!canCancelEwb(bill, new Date())) throw new DocumentError("E-way bills can only be cancelled within 24 hours of generation.");
      const { count } = await tx.eWayBill.updateMany({
        where: { id, status: "ACTIVE" },
        data: { status: "CANCELLED", ...(reason && { notes: [bill.notes, `Cancelled: ${reason}`].filter(Boolean).join("\n") }) },
      });
      if (count === 0) throw new DocumentError("This e-way bill is no longer active.");
      const message = `E-way bill ${bill.number} cancelled${reason ? `: ${reason}` : ""}`;
      await logActivity({ userId: user.id, entityType: "EWayBill", entityId: id, action: "cancelled", message }, tx);
      await logActivity({ userId: user.id, entityType: "Invoice", entityId: bill.invoiceId, action: "eway_bill_cancelled", message }, tx);
      return bill.invoiceId;
    }),
  );
  if (!result.ok) return { error: result.error };

  revalidateEwb(id, result.value);
  return undefined;
}
