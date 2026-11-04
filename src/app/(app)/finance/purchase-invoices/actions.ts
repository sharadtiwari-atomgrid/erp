"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { diff, recordChange } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db, type Tx } from "@/lib/db";
import { cancelPurchaseInvoice, postPurchaseInvoice } from "@/lib/finance/payables";
import { FinanceError } from "@/lib/finance/posting";
import { formatMoney } from "@/lib/format";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { addDaysIso, dayFromIso, todayIso } from "@/lib/ops/dates";
import { nextDocumentNumber } from "@/lib/sequence";
import { checkBillLines, computeBill, type BillLine } from "../_ar_ap/bill-lines";
import { attempt } from "../_ar_ap/server";

const headerSchema = z.object({
  supplierId: f.id("Supplier"),
  supplierInvoiceNo: f.optionalText(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date"),
  dueDate: f.optionalText().refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Enter a valid date"),
  branchId: f.id("Branch"),
  placeOfSupply: f.optionalText(),
  itcEligible: f.checkbox(),
  notes: f.optionalText(),
  purchaseOrderId: f.optionalText(),
  inboundReceiptId: f.optionalText(),
});

const lineSchema = z.object({
  kind: z.enum(["item", "expense"]),
  productId: z.string().nullish().transform((v) => v || null),
  glAccountId: z.string().nullish().transform((v) => v || null),
  description: z.string().trim().nullish().transform((v) => v || null),
  hsnCode: z.string().trim().nullish().transform((v) => v || null),
  quantity: z.coerce.number(),
  unitPrice: z.coerce.number(),
  discountPct: z.coerce.number(),
  taxRate: z.coerce.number(),
});

function readLines(formData: FormData): { ok: true; lines: BillLine[] } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { ok: false, error: "Could not read the lines." };
  }
  const parsed = z.array(lineSchema).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Some lines are not filled in correctly." };
  const lines = parsed.data.map((l) => (l.kind === "item" ? { ...l, glAccountId: null } : { ...l, productId: null }));
  const error = checkBillLines(lines);
  return error ? { ok: false, error } : { ok: true, lines };
}

/** Header + lines, with due date and place of supply defaulted from the supplier. */
async function readBill(formData: FormData) {
  const parsed = parseForm(headerSchema, formData);
  if (!parsed.ok) return { ok: false as const, state: parsed.state };
  const lines = readLines(formData);
  if (!lines.ok) return { ok: false as const, state: { error: lines.error } };
  const h = parsed.data;
  const supplier = await db.contact.findUnique({ where: { id: h.supplierId }, select: { roles: true, state: true, paymentTermsDays: true } });
  if (!supplier || !supplier.roles.some((r) => r === "SUPPLIER" || r === "TRANSPORTER")) {
    return { ok: false as const, state: { error: "Please fix the highlighted fields.", fieldErrors: { supplierId: ["Choose a supplier or transporter"] } } };
  }
  const glIds = [...new Set(lines.lines.map((l) => l.glAccountId).filter((v): v is string => !!v))];
  if (glIds.length) {
    const ok = await db.glAccount.count({ where: { id: { in: glIds }, isGroup: false, isActive: true, directPosting: true } });
    if (ok !== glIds.length) return { ok: false as const, state: { error: "An expense line uses a ledger account that can’t be posted to directly." } };
  }
  const doc = computeBill(lines.lines);
  const dueIso = h.dueDate ?? addDaysIso(h.invoiceDate, supplier.paymentTermsDays);
  if (dueIso < h.invoiceDate) return { ok: false as const, state: { error: "Please fix the highlighted fields.", fieldErrors: { dueDate: ["Due date can’t be before the invoice date"] } } };
  return {
    ok: true as const,
    header: {
      supplierId: h.supplierId,
      supplierInvoiceNo: h.supplierInvoiceNo,
      invoiceDate: dayFromIso(h.invoiceDate),
      dueDate: dayFromIso(dueIso),
      branchId: h.branchId,
      placeOfSupply: h.placeOfSupply ?? supplier.state,
      itcEligible: h.itcEligible,
      notes: h.notes,
      subtotal: doc.subtotal,
      taxTotal: doc.taxTotal,
      total: doc.total,
    },
    links: { purchaseOrderId: h.purchaseOrderId, inboundReceiptId: h.inboundReceiptId },
    lines: doc.lines,
  };
}

async function assertUniqueSupplierInvoice(tx: Tx, supplierId: string, supplierInvoiceNo: string | null, exceptId?: string) {
  if (!supplierInvoiceNo) return;
  const dup = await tx.purchaseInvoice.findFirst({
    where: { supplierId, supplierInvoiceNo: { equals: supplierInvoiceNo, mode: "insensitive" }, status: { not: "CANCELLED" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { number: true },
  });
  if (dup) throw new FinanceError(`Supplier invoice ${supplierInvoiceNo} is already entered on ${dup.number}.`);
}

const lineRow = (l: ReturnType<typeof computeBill>["lines"][number]) => ({
  productId: l.productId,
  glAccountId: l.glAccountId,
  description: l.description,
  hsnCode: l.hsnCode,
  quantity: l.quantity,
  unitPrice: l.unitPrice,
  discountPct: l.discountPct,
  taxRate: l.taxRate,
  taxAmount: l.taxAmount,
  lineTotal: l.lineTotal,
  position: l.position,
});

function revalidateBills(id?: string) {
  revalidatePath("/finance/purchase-invoices");
  if (id) revalidatePath(`/finance/purchase-invoices/${id}`);
  revalidatePath("/finance", "layout");
}

export async function createPurchaseInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const bill = await readBill(formData);
  if (!bill.ok) return bill.state;
  const post = formData.get("intent") === "post";

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      await assertUniqueSupplierInvoice(tx, bill.header.supplierId, bill.header.supplierInvoiceNo);
      const number = await nextDocumentNumber(tx, "PURCHASE_INVOICE");
      const created = await tx.purchaseInvoice.create({
        data: { ...bill.header, ...bill.links, number, lines: { create: bill.lines.map(lineRow) } },
      });
      await recordChange(
        { userId: user.id, entityType: "PurchaseInvoice", entityId: created.id, action: "created", message: `Purchase invoice ${number} for ${formatMoney(bill.header.total)} created` },
        tx,
      );
      if (post) {
        const txNo = await postPurchaseInvoice(tx, created.id, user.id);
        await recordChange({ userId: user.id, entityType: "PurchaseInvoice", entityId: created.id, action: "posted", message: `Purchase invoice ${number} posted (transaction ${txNo})` }, tx);
      }
      return created;
    }, { timeout: 30_000 }),
  );
  if (!result.ok) return { error: result.error };
  revalidateBills(result.value.id);
  redirect(`/finance/purchase-invoices/${result.value.id}`);
}

export async function updatePurchaseInvoice(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const bill = await readBill(formData);
  if (!bill.ok) return bill.state;
  const post = formData.get("intent") === "post";

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const current = await tx.purchaseInvoice.findUnique({ where: { id } });
      if (!current) throw new FinanceError("Purchase invoice not found.");
      if (current.status !== "DRAFT") throw new FinanceError("Only draft purchase invoices can be edited.");
      await assertUniqueSupplierInvoice(tx, bill.header.supplierId, bill.header.supplierInvoiceNo, id);
      const updated = await tx.purchaseInvoice.update({ where: { id }, data: bill.header });
      await tx.purchaseInvoiceLine.deleteMany({ where: { purchaseInvoiceId: id } });
      await tx.purchaseInvoiceLine.createMany({ data: bill.lines.map((l) => ({ ...lineRow(l), purchaseInvoiceId: id })) });
      await recordChange(
        { userId: user.id, entityType: "PurchaseInvoice", entityId: id, action: "updated", message: `Purchase invoice ${current.number} updated`, changes: diff(current, updated) },
        tx,
      );
      if (post) {
        const txNo = await postPurchaseInvoice(tx, id, user.id);
        await recordChange({ userId: user.id, entityType: "PurchaseInvoice", entityId: id, action: "posted", message: `Purchase invoice ${current.number} posted (transaction ${txNo})` }, tx);
      }
    }, { timeout: 30_000 }),
  );
  if (!result.ok) return { error: result.error };
  revalidateBills(id);
  redirect(`/finance/purchase-invoices/${id}`);
}

export async function postBill(id: string): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const txNo = await postPurchaseInvoice(tx, id, user.id);
      const b = await tx.purchaseInvoice.findUniqueOrThrow({ where: { id }, select: { number: true } });
      await recordChange({ userId: user.id, entityType: "PurchaseInvoice", entityId: id, action: "posted", message: `Purchase invoice ${b.number} posted (transaction ${txNo})` }, tx);
    }, { timeout: 30_000 }),
  );
  if (!result.ok) return { error: result.error };
  revalidateBills(id);
  return undefined;
}

export async function cancelBill(id: string): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const reversal = await cancelPurchaseInvoice(tx, id, user.id, todayIso());
      const b = await tx.purchaseInvoice.findUniqueOrThrow({ where: { id }, select: { number: true } });
      await recordChange(
        { userId: user.id, entityType: "PurchaseInvoice", entityId: id, action: "cancelled", message: `Purchase invoice ${b.number} cancelled${reversal ? ` (reversal transaction ${reversal})` : ""}` },
        tx,
      );
    }, { timeout: 30_000 }),
  );
  if (!result.ok) return { error: result.error };
  revalidateBills(id);
  return undefined;
}

export async function deleteDraftBill(id: string): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const b = await tx.purchaseInvoice.findUnique({ where: { id }, select: { number: true, status: true, _count: { select: { applications: true, fixedAssets: true } } } });
      if (!b) throw new FinanceError("Purchase invoice not found.");
      if (b.status !== "DRAFT") throw new FinanceError("Only drafts can be deleted. Cancel a posted bill instead.");
      if (b._count.applications || b._count.fixedAssets) throw new FinanceError("This draft is linked to payments or fixed assets and can’t be deleted.");
      await tx.purchaseInvoice.delete({ where: { id } });
      await recordChange({ userId: user.id, entityType: "PurchaseInvoice", entityId: id, action: "deleted", message: `Draft purchase invoice ${b.number} deleted` }, tx);
    }),
  );
  if (!result.ok) return { error: result.error };
  revalidateBills();
  redirect("/finance/purchase-invoices");
}
