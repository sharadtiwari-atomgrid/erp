"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, formatNumber, humanize, num } from "@/lib/format";
import { f, parseForm, parseLines, type ActionState } from "@/lib/forms";
import { can } from "@/lib/permissions";
import { nextDocumentNumber } from "@/lib/sequence";
import { adjustStock } from "@/lib/stock";
import { computeDocument } from "@/lib/totals";
import type { SalesOrderStatus } from "@/generated/prisma/enums";
import { attempt } from "../_lib/attempt";
import { copyLines, DocumentError, lineData } from "../_lib/documents";
import { warehouseBranchId } from "@/lib/branch";

const orderSchema = z.object({
  customerId: f.id("Customer"),
  warehouseId: f.id("Warehouse"),
  orderDate: f.date(),
  expectedDate: f.optionalDate(),
  notes: f.optionalText(),
});

/** Orders that can still receive deliveries. */
const DELIVERABLE: SalesOrderStatus[] = ["CONFIRMED", "PARTIALLY_DELIVERED"];
/** Orders that can be invoiced. */
const INVOICEABLE: SalesOrderStatus[] = ["CONFIRMED", "PARTIALLY_DELIVERED", "DELIVERED"];

/** Quantities are stored with 3 decimals; compare with a small tolerance. */
const EPSILON = 0.0005;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

function revalidateOrder(id: string) {
  revalidatePath("/sales/orders");
  revalidatePath(`/sales/orders/${id}`);
}

export async function createOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("salesOrders", "edit");
  const parsed = parseForm(orderSchema, formData);
  if (!parsed.ok) return parsed.state;
  const items = parseLines(formData);
  if (!items.ok) return items.state;
  const doc = computeDocument(items.lines);

  const order = await db.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, "SALES_ORDER");
    const created = await tx.salesOrder.create({
      data: {
        ...parsed.data,
        branchId: await warehouseBranchId(tx, parsed.data.warehouseId),
        number,
        subtotal: doc.subtotal,
        taxTotal: doc.taxTotal,
        total: doc.total,
        lines: { create: doc.lines.map(lineData) },
      },
    });
    await logActivity(
      { userId: user.id, entityType: "SalesOrder", entityId: created.id, action: "created", message: `Sales order ${number} created` },
      tx,
    );
    return created;
  });

  revalidatePath("/sales/orders");
  redirect(`/sales/orders/${order.id}`);
}

export async function updateOrder(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("salesOrders", "edit");
  const parsed = parseForm(orderSchema, formData);
  if (!parsed.ok) return parsed.state;
  const items = parseLines(formData);
  if (!items.ok) return items.state;
  const doc = computeDocument(items.lines);

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const current = await tx.salesOrder.findUnique({ where: { id }, select: { number: true, status: true } });
      if (!current) throw new DocumentError("Sales order not found.");
      if (current.status !== "DRAFT") throw new DocumentError("Only draft sales orders can be edited.");

      await tx.salesOrder.update({
        where: { id },
        data: {
          ...parsed.data,
          branchId: await warehouseBranchId(tx, parsed.data.warehouseId),
          subtotal: doc.subtotal,
          taxTotal: doc.taxTotal,
          total: doc.total,
        },
      });
      await tx.salesOrderLine.deleteMany({ where: { salesOrderId: id } });
      await tx.salesOrderLine.createMany({ data: doc.lines.map((l) => ({ ...lineData(l), salesOrderId: id })) });
      await logActivity(
        { userId: user.id, entityType: "SalesOrder", entityId: id, action: "updated", message: `Sales order ${current.number} updated` },
        tx,
      );
    }),
  );
  if (!result.ok) return { error: result.error };

  revalidateOrder(id);
  redirect(`/sales/orders/${id}`);
}

export async function confirmOrder(id: string): Promise<ActionState> {
  const user = await requireUser("salesOrders", "edit");
  const order = await db.salesOrder.findUnique({ where: { id }, select: { number: true, status: true } });
  if (!order) return { error: "Sales order not found." };
  if (order.status !== "DRAFT") return { error: "Only draft orders can be confirmed." };

  await db.$transaction(async (tx) => {
    await tx.salesOrder.update({ where: { id }, data: { status: "CONFIRMED" } });
    await logActivity(
      { userId: user.id, entityType: "SalesOrder", entityId: id, action: "confirmed", message: `Sales order ${order.number} confirmed` },
      tx,
    );
  });

  revalidateOrder(id);
  return undefined;
}

export async function cancelOrder(id: string): Promise<ActionState> {
  const user = await requireUser("salesOrders", "edit");

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const order = await tx.salesOrder.findUnique({
        where: { id },
        include: {
          lines: { select: { deliveredQty: true } },
          invoices: { where: { status: { not: "CANCELLED" } }, select: { number: true } },
        },
      });
      if (!order) throw new DocumentError("Sales order not found.");
      if (order.status !== "DRAFT" && order.status !== "CONFIRMED") {
        throw new DocumentError(`A ${humanize(order.status).toLowerCase()} order can’t be cancelled.`);
      }
      if (order.lines.some((l) => num(l.deliveredQty) > 0)) throw new DocumentError("Goods have already been delivered against this order.");
      if (order.invoices.length > 0) throw new DocumentError(`Cancel invoice ${order.invoices[0].number} first.`);

      await tx.salesOrder.update({ where: { id }, data: { status: "CANCELLED" } });
      await logActivity(
        { userId: user.id, entityType: "SalesOrder", entityId: id, action: "cancelled", message: `Sales order ${order.number} cancelled` },
        tx,
      );
    }),
  );
  if (!result.ok) return { error: result.error };

  revalidateOrder(id);
  return undefined;
}

/**
 * Delivers goods against the order. The form posts `qty_<lineId>` for each
 * line. Stock leaves the order's warehouse; services count as delivered
 * without moving stock.
 */
export async function deliverOrder(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  // Warehouse staff can deliver orders they can't otherwise edit.
  const user = await requireUser("salesOrders", "view");
  if (!can(user, "salesOrders", "edit") && !can(user, "stock", "edit")) {
    return { error: "You don’t have permission to deliver orders." };
  }

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const order = await tx.salesOrder.findUnique({
        where: { id },
        include: { lines: { orderBy: { position: "asc" }, include: { product: { select: { name: true } } } } },
      });
      if (!order) throw new DocumentError("Sales order not found.");
      if (!DELIVERABLE.includes(order.status)) throw new DocumentError("Only confirmed orders can be delivered.");

      let delivered = 0;
      let complete = true;
      for (const line of order.lines) {
        const ordered = num(line.quantity);
        const already = num(line.deliveredQty);
        const raw = String(formData.get(`qty_${line.id}`) ?? "").trim();
        const qty = raw === "" ? 0 : round3(Number(raw));
        if (!Number.isFinite(qty) || qty < 0) throw new DocumentError(`Enter a valid quantity for ${line.product.name}.`);
        if (qty > ordered - already + EPSILON) {
          throw new DocumentError(`Only ${formatNumber(ordered - already)} of ${line.product.name} remain to be delivered.`);
        }
        if (already + qty < ordered - EPSILON) complete = false;
        if (qty === 0) continue;

        // Guarded increment so concurrent deliveries can't exceed the ordered quantity.
        const { count } = await tx.salesOrderLine.updateMany({
          where: { id: line.id, deliveredQty: { lte: round3(ordered - qty + EPSILON) } },
          data: { deliveredQty: { increment: qty } },
        });
        if (count === 0) throw new DocumentError(`${line.product.name} was delivered by someone else. Reload and try again.`);

        await adjustStock(tx, {
          productId: line.productId,
          warehouseId: order.warehouseId,
          quantity: -qty,
          type: "DELIVERY",
          referenceType: "SalesOrder",
          referenceId: id,
          reference: order.number,
          userId: user.id,
        });
        delivered++;
      }
      if (delivered === 0) throw new DocumentError("Enter a quantity to deliver on at least one line.");

      const status: SalesOrderStatus = complete ? "DELIVERED" : "PARTIALLY_DELIVERED";
      await tx.salesOrder.update({ where: { id }, data: { status } });
      await logActivity(
        {
          userId: user.id,
          entityType: "SalesOrder",
          entityId: id,
          action: "delivered",
          message: `Sales order ${order.number} ${complete ? "fully delivered" : "partially delivered"} (${delivered} line${delivered === 1 ? "" : "s"})`,
        },
        tx,
      );
    }),
  );
  if (!result.ok) return { error: result.error };

  revalidateOrder(id);
  revalidatePath("/inventory/stock");
  revalidatePath("/inventory/movements");
  redirect(`/sales/orders/${id}`);
}

/** Creates a draft invoice with the order's lines. One active invoice per order. */
export async function createInvoiceFromOrder(id: string): Promise<ActionState> {
  const user = await requireUser("invoices", "edit");

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const order = await tx.salesOrder.findUnique({
        where: { id },
        include: {
          customer: { select: { state: true, paymentTermsDays: true } },
          lines: { orderBy: { position: "asc" } },
          invoices: { where: { status: { not: "CANCELLED" } }, select: { number: true } },
        },
      });
      if (!order) throw new DocumentError("Sales order not found.");
      if (!INVOICEABLE.includes(order.status)) throw new DocumentError("Confirm the order before invoicing it.");
      if (order.invoices.length > 0) throw new DocumentError(`Invoice ${order.invoices[0].number} already exists for this order.`);

      const issueDate = new Date();
      const number = await nextDocumentNumber(tx, "INVOICE");
      const invoice = await tx.invoice.create({
        data: {
          number,
          customerId: order.customerId,
          salesOrderId: id,
          branchId: order.branchId,
          issueDate,
          dueDate: addDays(issueDate, order.customer.paymentTermsDays),
          placeOfSupply: order.customer.state,
          subtotal: order.subtotal,
          taxTotal: order.taxTotal,
          total: order.total,
          notes: order.notes,
          lines: { create: copyLines(order.lines) },
        },
      });
      await logActivity(
        { userId: user.id, entityType: "Invoice", entityId: invoice.id, action: "created", message: `Invoice ${number} created from ${order.number}` },
        tx,
      );
      await logActivity(
        { userId: user.id, entityType: "SalesOrder", entityId: id, action: "invoiced", message: `Invoice ${number} created for ${order.number}` },
        tx,
      );
      return invoice;
    }),
  );
  if (!result.ok) return { error: result.error };

  revalidateOrder(id);
  revalidatePath("/sales/invoices");
  redirect(`/sales/invoices/${result.value.id}`);
}
