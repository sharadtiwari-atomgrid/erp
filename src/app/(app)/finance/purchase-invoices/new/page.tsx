import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { defaultBranchId } from "@/lib/branch";
import { db } from "@/lib/db";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { num } from "@/lib/format";
import { param } from "@/lib/forms";
import { addDaysIso, todayIso } from "@/lib/ops/dates";
import { unbilledPoQuantities, type BillLine } from "../../_ar_ap/bill-lines";
import { getBillFormOptions } from "../../_ar_ap/options";
import { createPurchaseInvoice } from "../actions";
import { BillForm, type BillFormValues } from "../bill-form";

export const metadata: Metadata = { title: "New Purchase Invoice" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

/** Quantities already billed on non-cancelled bills, per product. */
async function billedByProduct(where: { purchaseOrderId?: string; inboundReceiptId?: string }) {
  const rows = await db.purchaseInvoiceLine.groupBy({
    by: ["productId"],
    where: { productId: { not: null }, purchaseInvoice: { ...where, status: { not: "CANCELLED" } } },
    _sum: { quantity: true },
  });
  return new Map(rows.map((r) => [r.productId as string, num(r._sum.quantity)]));
}

/** Lines and header copied from a purchase order (received − billed) or a goods receipt (accepted / received). */
async function prefill(purchaseOrderId: string, inboundReceiptId: string): Promise<{ values: Partial<BillFormValues>; notice?: string }> {
  if (inboundReceiptId) {
    const grn = await db.inboundReceipt.findUnique({
      where: { id: inboundReceiptId },
      include: {
        purchaseOrder: { select: { supplierId: true } },
        lines: { include: { product: { select: { name: true, purchasePrice: true, taxRate: true, hsnCode: true } }, purchaseOrderLine: true } },
      },
    });
    if (!grn) return { values: {}, notice: "That goods receipt was not found." };
    const already = await db.purchaseInvoice.findFirst({ where: { inboundReceiptId, status: { not: "CANCELLED" } }, select: { number: true } });
    const lines: BillLine[] = grn.lines
      .map((l) => ({
        kind: "item" as const,
        productId: l.productId,
        glAccountId: null,
        description: l.purchaseOrderLine?.description ?? null,
        hsnCode: l.product.hsnCode,
        quantity: l.qcResult === "PENDING" ? num(l.receivedQty) : num(l.acceptedQty),
        unitPrice: l.purchaseOrderLine ? num(l.purchaseOrderLine.unitPrice) : num(l.unitCost) || num(l.product.purchasePrice),
        discountPct: l.purchaseOrderLine ? num(l.purchaseOrderLine.discountPct) : 0,
        taxRate: l.purchaseOrderLine ? num(l.purchaseOrderLine.taxRate) : num(l.product.taxRate),
      }))
      .filter((l) => l.quantity > 0);
    return {
      values: {
        supplierId: grn.supplierId ?? grn.purchaseOrder?.supplierId ?? "",
        supplierInvoiceNo: grn.supplierInvoice ?? "",
        branchId: grn.branchId,
        purchaseOrderId: grn.purchaseOrderId ?? "",
        inboundReceiptId: grn.id,
        notes: `Goods receipt ${grn.number}`,
        lines,
      },
      notice: already
        ? `Goods receipt ${grn.number} is already billed on ${already.number}. Check before saving a second bill.`
        : lines.length === 0
          ? `Nothing was accepted on goods receipt ${grn.number}.`
          : `Lines copied from goods receipt ${grn.number} (accepted quantities; received quantities where QC is pending).`,
    };
  }

  const po = await db.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    include: { lines: { orderBy: { position: "asc" }, include: { product: { select: { hsnCode: true } } } } },
  });
  if (!po) return { values: {}, notice: "That purchase order was not found." };
  const left = unbilledPoQuantities(
    po.lines.map((l) => ({ id: l.id, productId: l.productId, receivedQty: num(l.receivedQty) })),
    await billedByProduct({ purchaseOrderId }),
  );
  const lines: BillLine[] = po.lines
    .map((l) => ({
      kind: "item" as const,
      productId: l.productId,
      glAccountId: null,
      description: l.description,
      hsnCode: l.product.hsnCode,
      quantity: left.get(l.id) ?? 0,
      unitPrice: num(l.unitPrice),
      discountPct: num(l.discountPct),
      taxRate: num(l.taxRate),
    }))
    .filter((l) => l.quantity > 0);
  return {
    values: { supplierId: po.supplierId, branchId: po.branchId, purchaseOrderId: po.id, notes: `Purchase order ${po.number}`, lines },
    notice: lines.length
      ? `Lines copied from purchase order ${po.number}: quantities received and not yet billed.`
      : `Everything received on purchase order ${po.number} is already billed (or nothing has been received yet).`,
  };
}

export default async function NewPurchaseInvoicePage({ searchParams }: PageProps<"/finance/purchase-invoices/new">) {
  await requireUser("finance", "edit");
  await ensureFinanceSetup();
  const sp = await searchParams;
  const purchaseOrderId = param(sp, "purchaseOrderId");
  const inboundReceiptId = param(sp, "inboundReceiptId");
  const from = purchaseOrderId || inboundReceiptId ? await prefill(purchaseOrderId, inboundReceiptId) : { values: {} as Partial<BillFormValues> };
  const supplierId = from.values.supplierId || param(sp, "supplierId");
  const branchId = from.values.branchId || (await defaultBranchId());
  const options = await getBillFormOptions({ supplierId, branchId });
  const supplier = options.suppliers.find((s) => s.id === supplierId);
  const today = todayIso();

  const initial: BillFormValues = {
    supplierId,
    supplierInvoiceNo: from.values.supplierInvoiceNo ?? "",
    invoiceDate: today,
    dueDate: supplier ? addDaysIso(today, supplier.paymentTermsDays) : "",
    branchId,
    placeOfSupply: supplier?.state ?? "",
    itcEligible: true,
    notes: from.values.notes ?? "",
    purchaseOrderId: from.values.purchaseOrderId ?? "",
    inboundReceiptId: from.values.inboundReceiptId ?? "",
    lines: from.values.lines ?? [],
  };

  return (
    <div className="max-w-7xl">
      <PageHeader title="New Purchase Invoice" back={{ href: "/finance/purchase-invoices", label: "Purchase Invoices" }} />
      <BillForm action={createPurchaseInvoice} initial={initial} {...options} cancelHref="/finance/purchase-invoices" notice={"notice" in from ? from.notice : undefined} />
    </div>
  );
}
