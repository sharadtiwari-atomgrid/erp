"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db, type Tx } from "@/lib/db";
import { addDays, formatNumber, humanize, num } from "@/lib/format";
import { f, parseForm, parseLines, type ActionState } from "@/lib/forms";
import { nextDocumentNumber } from "@/lib/sequence";
import { releaseStock, reserveStock } from "@/lib/stock";
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

/** Reserves what each goods line still needs (undelivered minus already reserved). */
async function reserveOrderLines(tx: Tx, salesOrderId: string) {
  const order = await tx.salesOrder.findUniqueOrThrow({
    where: { id: salesOrderId },
    select: { warehouseId: true, lines: { select: { id: true, productId: true, quantity: true, deliveredQty: true, reservedQty: true, product: { select: { type: true } } } } },
  });
  let reserved = 0;
  let short = 0;
  for (const line of order.lines) {
    if (line.product.type === "SERVICE") continue;
    const need = round3(num(line.quantity) - num(line.deliveredQty) - num(line.reservedQty));
    if (need <= EPSILON) continue;
    const got = await reserveStock(tx, { productId: line.productId, warehouseId: order.warehouseId, quantity: need });
    if (got > 0) await tx.salesOrderLine.update({ where: { id: line.id }, data: { reservedQty: { increment: got } } });
    reserved = round3(reserved + got);
    short = round3(short + need - got);
  }
  return { reserved, short };
}

/** Releases every reservation held by the order's lines. */
async function releaseOrderLines(tx: Tx, salesOrderId: string) {
  const order = await tx.salesOrder.findUniqueOrThrow({
    where: { id: salesOrderId },
    select: { warehouseId: true, lines: { where: { reservedQty: { gt: 0 } }, select: { id: true, productId: true, reservedQty: true } } },
  });
  for (const line of order.lines) {
    await releaseStock(tx, { productId: line.productId, warehouseId: order.warehouseId, quantity: num(line.reservedQty) });
    await tx.salesOrderLine.update({ where: { id: line.id }, data: { reservedQty: 0 } });
  }
}

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

/**
 * Confirms a draft order and reserves stock for each goods line in the
 * order's warehouse. Partial reservation is fine: the shortfall is shown on
 * the order and can be topped up later with "Reserve stock".
 */
export async function confirmOrder(id: string): Promise<ActionState> {
  const user = await requireUser("salesOrders", "edit");

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const { count } = await tx.salesOrder.updateMany({ where: { id, status: "DRAFT" }, data: { status: "CONFIRMED" } });
      if (count === 0) throw new DocumentError("Only draft orders can be confirmed.");
      const order = await tx.salesOrder.findUniqueOrThrow({ where: { id }, select: { number: true } });
      const { reserved, short } = await reserveOrderLines(tx, id);
      await logActivity(
        {
          userId: user.id,
          entityType: "SalesOrder",
          entityId: id,
          action: "confirmed",
          message: `Sales order ${order.number} confirmed; ${formatNumber(reserved)} reserved${short > 0 ? `, ${formatNumber(short)} short` : ""}`,
        },
        tx,
      );
    }),
  );
  if (!result.ok) return { error: result.error };

  revalidateOrder(id);
  revalidatePath("/inventory/stock");
  return undefined;
}

/** Tops up reservations for an open order, e.g. after new stock has arrived. */
export async function reserveOrderStock(id: string): Promise<ActionState> {
  const user = await requireUser("salesOrders", "edit");

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const order = await tx.salesOrder.findUnique({ where: { id }, select: { number: true, status: true } });
      if (!order) throw new DocumentError("Sales order not found.");
      if (!DELIVERABLE.includes(order.status)) throw new DocumentError("Only confirmed orders hold reservations.");
      const { reserved, short } = await reserveOrderLines(tx, id);
      if (reserved === 0) throw new DocumentError(short > 0 ? "No free stock is available to reserve." : "Everything is already reserved.");
      await logActivity(
        {
          userId: user.id,
          entityType: "SalesOrder",
          entityId: id,
          action: "reserved",
          message: `${formatNumber(reserved)} more reserved for ${order.number}${short > 0 ? `; ${formatNumber(short)} still short` : ""}`,
        },
        tx,
      );
    }),
  );
  if (!result.ok) return { error: result.error };

  revalidateOrder(id);
  revalidatePath("/inventory/stock");
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
          outboundOrders: { where: { status: { notIn: ["DISPATCHED", "CANCELLED"] } }, select: { number: true } },
        },
      });
      if (!order) throw new DocumentError("Sales order not found.");
      if (order.status !== "DRAFT" && order.status !== "CONFIRMED") {
        throw new DocumentError(`A ${humanize(order.status).toLowerCase()} order can’t be cancelled.`);
      }
      if (order.lines.some((l) => num(l.deliveredQty) > 0)) throw new DocumentError("Goods have already been delivered against this order.");
      if (order.invoices.length > 0) throw new DocumentError(`Cancel invoice ${order.invoices[0].number} first.`);
      if (order.outboundOrders.length > 0) throw new DocumentError(`Cancel outbound order ${order.outboundOrders[0].number} first.`);

      const { count } = await tx.salesOrder.updateMany({ where: { id, status: { in: ["DRAFT", "CONFIRMED"] } }, data: { status: "CANCELLED" } });
      if (count === 0) throw new DocumentError("This order was changed by someone else. Reload and try again.");
      await releaseOrderLines(tx, id);
      await logActivity(
        { userId: user.id, entityType: "SalesOrder", entityId: id, action: "cancelled", message: `Sales order ${order.number} cancelled` },
        tx,
      );
    }),
  );
  if (!result.ok) return { error: result.error };

  revalidateOrder(id);
  revalidatePath("/inventory/stock");
  return undefined;
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
