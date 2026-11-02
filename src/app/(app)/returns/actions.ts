"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { warehouseBranchId } from "@/lib/branch";
import { db } from "@/lib/db";
import { formatMoney, formatNumber, num } from "@/lib/format";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { nextDocumentNumber } from "@/lib/sequence";
import { adjustStock } from "@/lib/stock";
import { round2 } from "@/lib/totals";
import { attempt } from "../sales/_lib/attempt";
import { DocumentError } from "../sales/_lib/documents";
import { closeBlocker } from "./_lib/returns";
import { loadReturnSource } from "./_lib/source";

const headerSchema = z.object({
  customerId: f.id("Customer"),
  warehouseId: f.id("Receiving warehouse"),
  invoiceId: z.string().optional().transform((v) => v || null),
  salesOrderId: z.string().optional().transform((v) => v || null),
  reason: f.optionalText(),
  notes: f.optionalText(),
});

const linesSchema = z
  .array(z.object({ productId: z.string().min(1, "Choose a product on every line"), quantity: z.coerce.number().min(0) }))
  .transform((lines) => lines.filter((l) => l.quantity > 0))
  .pipe(z.array(z.object({ productId: z.string(), quantity: z.number() })).min(1, "Enter a quantity to return on at least one line"));

function revalidateReturn(id: string) {
  revalidatePath("/returns");
  revalidatePath(`/returns/${id}`);
}

export async function createReturn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("returns", "edit");
  const parsed = parseForm(headerSchema, formData);
  if (!parsed.ok) return parsed.state;
  let rawLines: unknown;
  try {
    rawLines = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { error: "Could not read the return lines." };
  }
  const lines = linesSchema.safeParse(rawLines);
  if (!lines.success) return { error: lines.error.issues[0]?.message ?? "Invalid return lines." };

  // Merge duplicate products.
  const qty = new Map<string, number>();
  for (const l of lines.data) qty.set(l.productId, (qty.get(l.productId) ?? 0) + l.quantity);

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const header = { ...parsed.data };
      if (header.invoiceId || header.salesOrderId) {
        const source = await loadReturnSource({ invoiceId: header.invoiceId, salesOrderId: header.invoiceId ? null : header.salesOrderId }, tx);
        if (!source) throw new DocumentError("The invoice or sales order can't be returned against.");
        if (source.customerId !== header.customerId) throw new DocumentError(`${source.number} belongs to another customer.`);
        header.invoiceId = source.invoiceId;
        header.salesOrderId = source.salesOrderId;
        const byProduct = new Map(source.lines.map((l) => [l.productId, l]));
        for (const [productId, q] of qty) {
          const line = byProduct.get(productId);
          if (!line) throw new DocumentError(`A product on this return isn't on ${source.number}.`);
          if (q > line.maxQty + 1e-9) {
            throw new DocumentError(`${line.name}: at most ${formatNumber(line.maxQty)} ${line.unit} can be returned against ${source.number}.`);
          }
        }
      }

      const branchId = await warehouseBranchId(tx, header.warehouseId);
      const number = await nextDocumentNumber(tx, "RETURN");
      const created = await tx.returnOrder.create({
        data: {
          ...header,
          number,
          branchId,
          lines: { create: [...qty].map(([productId, quantity]) => ({ productId, quantity })) },
        },
      });
      await logActivity({ userId: user.id, entityType: "ReturnOrder", entityId: created.id, action: "created", message: `Return ${number} requested` }, tx);
      return created;
    }),
  );
  if (!result.ok) return { error: result.error };

  revalidateReturn(result.value.id);
  if (result.value.invoiceId) revalidatePath(`/sales/invoices/${result.value.invoiceId}`);
  redirect(`/returns/${result.value.id}`);
}

/** REQUESTED → RECEIVED, recording how much of each line actually arrived. */
export async function receiveReturn(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("returns", "edit");
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const ret = await tx.returnOrder.findUnique({ where: { id }, include: { lines: { include: { product: { select: { name: true } } } } } });
      if (!ret) throw new DocumentError("Return not found.");
      const received = ret.lines.map((l) => {
        const q = Number(formData.get(`received_${l.id}`) ?? 0);
        if (!Number.isFinite(q) || q < 0) throw new DocumentError(`Enter a valid received quantity for ${l.product.name}.`);
        if (q > num(l.quantity) + 1e-9) throw new DocumentError(`${l.product.name}: received can’t exceed the ${formatNumber(l.quantity)} requested.`);
        return { id: l.id, q };
      });
      if (received.every((r) => r.q === 0)) throw new DocumentError("Enter the quantity received on at least one line.");

      const { count } = await tx.returnOrder.updateMany({ where: { id, status: "REQUESTED" }, data: { status: "RECEIVED", receivedAt: new Date() } });
      if (count === 0) throw new DocumentError("Only requested returns can be received.");
      for (const r of received) await tx.returnLine.update({ where: { id: r.id }, data: { receivedQty: r.q } });
      await logActivity({ userId: user.id, entityType: "ReturnOrder", entityId: id, action: "received", message: `Return ${ret.number} received` }, tx);
    }),
  );
  if (!result.ok) return { error: result.error };
  revalidateReturn(id);
  return undefined;
}

const DISPOSITIONS = ["REPAIR", "RESTOCK", "SCRAP"] as const;
type Disposition = (typeof DISPOSITIONS)[number];

/**
 * RECEIVED → INSPECTED (return QC). RESTOCK puts the received quantity back
 * into the warehouse (RETURN_IN), SCRAP only records it, REPAIR waits for
 * "Mark repaired".
 */
export async function inspectReturn(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("returns", "edit");
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const ret = await tx.returnOrder.findUnique({ where: { id }, include: { lines: { include: { product: { select: { name: true } } } } } });
      if (!ret) throw new DocumentError("Return not found.");
      const decisions = ret.lines
        .filter((l) => num(l.receivedQty) > 0)
        .map((l) => {
          const d = String(formData.get(`disposition_${l.id}`) ?? "");
          if (!(DISPOSITIONS as readonly string[]).includes(d)) throw new DocumentError(`Choose repair, restock or scrap for ${l.product.name}.`);
          const notes = String(formData.get(`notes_${l.id}`) ?? "").trim() || null;
          return { line: l, disposition: d as Disposition, notes };
        });

      const { count } = await tx.returnOrder.updateMany({ where: { id, status: "RECEIVED" }, data: { status: "INSPECTED", inspectedAt: new Date() } });
      if (count === 0) throw new DocumentError("Only received returns can be inspected.");

      for (const { line, disposition, notes } of decisions) {
        const qty = num(line.receivedQty);
        await tx.returnLine.update({
          where: { id: line.id },
          data: {
            disposition,
            qcNotes: notes,
            restockedQty: disposition === "RESTOCK" ? qty : 0,
            scrappedQty: disposition === "SCRAP" ? qty : 0,
          },
        });
        if (disposition === "RESTOCK") {
          await adjustStock(tx, {
            productId: line.productId,
            warehouseId: ret.warehouseId,
            quantity: qty,
            type: "RETURN_IN",
            referenceType: "ReturnOrder",
            referenceId: id,
            reference: ret.number,
            note: "Customer return restocked after QC",
            userId: user.id,
          });
        }
      }
      const summary = DISPOSITIONS.map((d) => [d, decisions.filter((x) => x.disposition === d).length] as const)
        .filter(([, c]) => c > 0)
        .map(([d, c]) => `${c} ${d.toLowerCase()}`)
        .join(", ");
      await logActivity({ userId: user.id, entityType: "ReturnOrder", entityId: id, action: "inspected", message: `Return ${ret.number} inspected: ${summary}` }, tx);
    }),
  );
  if (!result.ok) return { error: result.error };
  revalidateReturn(id);
  revalidatePath("/inventory/stock");
  revalidatePath("/inventory/movements");
  return undefined;
}

/** Restocks a REPAIR line once it's been repaired. */
export async function markRepaired(id: string, lineId: string): Promise<ActionState> {
  const user = await requireUser("returns", "edit");
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const ret = await tx.returnOrder.findUnique({ where: { id }, select: { number: true, status: true, warehouseId: true } });
      if (!ret) throw new DocumentError("Return not found.");
      if (ret.status !== "INSPECTED") throw new DocumentError("Repairs can only be recorded on inspected returns.");
      const line = await tx.returnLine.findFirst({ where: { id: lineId, returnId: id }, include: { product: { select: { name: true } } } });
      if (!line) throw new DocumentError("Line not found.");
      const qty = num(line.receivedQty);
      const { count } = await tx.returnLine.updateMany({
        where: { id: lineId, returnId: id, disposition: "REPAIR", repairedAt: null },
        data: { repairedAt: new Date(), restockedQty: qty },
      });
      if (count === 0) throw new DocumentError("This line isn't awaiting repair.");
      await adjustStock(tx, {
        productId: line.productId,
        warehouseId: ret.warehouseId,
        quantity: qty,
        type: "RETURN_IN",
        referenceType: "ReturnOrder",
        referenceId: id,
        reference: ret.number,
        note: "Customer return restocked after repair",
        userId: user.id,
      });
      await logActivity(
        { userId: user.id, entityType: "ReturnOrder", entityId: id, action: "repaired", message: `${line.product.name} × ${formatNumber(qty)} repaired and restocked` },
        tx,
      );
    }),
  );
  if (!result.ok) return { error: result.error };
  revalidateReturn(id);
  revalidatePath("/inventory/stock");
  revalidatePath("/inventory/movements");
  return undefined;
}

function readCredit(formData: FormData): number | null {
  const raw = String(formData.get("creditAmount") ?? "").trim();
  const v = Number(raw);
  return raw !== "" && Number.isFinite(v) && v >= 0 ? round2(v) : null;
}

export async function saveCredit(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("returns", "edit");
  const credit = readCredit(formData);
  if (credit === null) return { error: "Enter a credit amount of 0 or more." };
  const { count } = await db.returnOrder.updateMany({
    where: { id, status: { in: ["REQUESTED", "RECEIVED", "INSPECTED"] } },
    data: { creditAmount: credit },
  });
  if (count === 0) return { error: "Credit can't be changed on a closed or cancelled return." };
  const ret = await db.returnOrder.findUniqueOrThrow({ where: { id }, select: { number: true } });
  await logActivity({ userId: user.id, entityType: "ReturnOrder", entityId: id, action: "credit", message: `Credit on ${ret.number} set to ${formatMoney(credit)}` });
  revalidateReturn(id);
  return undefined;
}

/** INSPECTED → CLOSED, once every REPAIR line is repaired. Records the final credit amount. */
export async function closeReturn(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("returns", "edit");
  const credit = readCredit(formData);
  if (credit === null) return { error: "Enter a credit amount of 0 or more." };
  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const ret = await tx.returnOrder.findUnique({ where: { id }, include: { lines: { select: { disposition: true, receivedQty: true, repairedAt: true } } } });
      if (!ret) throw new DocumentError("Return not found.");
      const blocker = closeBlocker(ret.status, ret.lines);
      if (blocker) throw new DocumentError(blocker);
      const { count } = await tx.returnOrder.updateMany({
        where: { id, status: "INSPECTED", lines: { none: { disposition: "REPAIR", repairedAt: null } } },
        data: { status: "CLOSED", closedAt: new Date(), creditAmount: credit },
      });
      if (count === 0) throw new DocumentError("This return was just updated. Reload and try again.");
      await logActivity(
        { userId: user.id, entityType: "ReturnOrder", entityId: id, action: "closed", message: `Return ${ret.number} closed with credit of ${formatMoney(credit)}` },
        tx,
      );
    }),
  );
  if (!result.ok) return { error: result.error };
  revalidateReturn(id);
  return undefined;
}

export async function cancelReturn(id: string): Promise<ActionState> {
  const user = await requireUser("returns", "edit");
  const { count } = await db.returnOrder.updateMany({ where: { id, status: "REQUESTED" }, data: { status: "CANCELLED" } });
  if (count === 0) return { error: "Only requested returns can be cancelled." };
  const ret = await db.returnOrder.findUniqueOrThrow({ where: { id }, select: { number: true, invoiceId: true } });
  await logActivity({ userId: user.id, entityType: "ReturnOrder", entityId: id, action: "cancelled", message: `Return ${ret.number} cancelled` });
  revalidateReturn(id);
  if (ret.invoiceId) revalidatePath(`/sales/invoices/${ret.invoiceId}`);
  return undefined;
}
