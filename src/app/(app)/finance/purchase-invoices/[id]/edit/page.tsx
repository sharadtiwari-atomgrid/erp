import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { num } from "@/lib/format";
import { isoFromDay } from "@/lib/ops/dates";
import { getBillFormOptions } from "../../../_ar_ap/options";
import { updatePurchaseInvoice } from "../../actions";
import { BillForm } from "../../bill-form";

export const metadata: Metadata = { title: "Edit Purchase Invoice" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function EditPurchaseInvoicePage({ params }: PageProps<"/finance/purchase-invoices/[id]/edit">) {
  await requireUser("finance", "edit");
  await ensureFinanceSetup();
  const { id } = await params;
  const bill = await db.purchaseInvoice.findUnique({ where: { id }, include: { lines: { orderBy: { position: "asc" } } } });
  if (!bill) notFound();
  if (bill.status !== "DRAFT") redirect(`/finance/purchase-invoices/${id}`);
  const options = await getBillFormOptions({ supplierId: bill.supplierId, branchId: bill.branchId });

  return (
    <div className="max-w-7xl">
      <PageHeader title={`Edit ${bill.number}`} back={{ href: `/finance/purchase-invoices/${id}`, label: bill.number }} />
      <BillForm
        action={updatePurchaseInvoice.bind(null, id)}
        initial={{
          supplierId: bill.supplierId,
          supplierInvoiceNo: bill.supplierInvoiceNo ?? "",
          invoiceDate: isoFromDay(bill.invoiceDate),
          dueDate: isoFromDay(bill.dueDate),
          branchId: bill.branchId,
          placeOfSupply: bill.placeOfSupply ?? "",
          itcEligible: bill.itcEligible,
          notes: bill.notes ?? "",
          purchaseOrderId: bill.purchaseOrderId ?? "",
          inboundReceiptId: bill.inboundReceiptId ?? "",
          lines: bill.lines.map((l) => ({
            kind: l.productId ? ("item" as const) : ("expense" as const),
            productId: l.productId,
            glAccountId: l.glAccountId,
            description: l.description,
            hsnCode: l.hsnCode,
            quantity: num(l.quantity),
            unitPrice: num(l.unitPrice),
            discountPct: num(l.discountPct),
            taxRate: num(l.taxRate),
          })),
        }}
        {...options}
        cancelHref={`/finance/purchase-invoices/${id}`}
      />
    </div>
  );
}
