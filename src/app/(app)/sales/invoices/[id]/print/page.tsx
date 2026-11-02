import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, num } from "@/lib/format";
import { getCompany } from "@/lib/options";
import { PrintDocument } from "../../../_components/print-document";

export const metadata: Metadata = { title: "Print invoice" };

export default async function PrintInvoicePage({ params }: PageProps<"/sales/invoices/[id]/print">) {
  await requireUser("invoices");
  const { id } = await params;
  const [invoice, company] = await Promise.all([
    db.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        salesOrder: { select: { number: true } },
        lines: { orderBy: { position: "asc" }, include: { product: { select: { sku: true, name: true, unit: true, hsnCode: true } } } },
      },
    }),
    getCompany(),
  ]);
  if (!invoice) notFound();
  const { customer } = invoice;
  const paid = num(invoice.amountPaid);

  return (
    <PrintDocument
      title={invoice.status === "DRAFT" ? "Draft invoice" : invoice.status === "CANCELLED" ? "Tax invoice (cancelled)" : "Tax invoice"}
      backHref={`/sales/invoices/${id}`}
      company={company}
      meta={[
        { label: "Invoice no.", value: invoice.number },
        { label: "Invoice date", value: formatDate(invoice.issueDate) },
        { label: "Due date", value: formatDate(invoice.dueDate) },
        ...(invoice.salesOrder ? [{ label: "Order ref.", value: invoice.salesOrder.number }] : []),
      ]}
      party={{ ...customer, address: customer.billingAddress }}
      placeOfSupply={invoice.placeOfSupply ?? customer.state}
      lines={invoice.lines}
      subtotal={invoice.subtotal}
      taxTotal={invoice.taxTotal}
      total={invoice.total}
      extraTotals={paid > 0 ? [{ label: "Amount paid", value: paid }, { label: "Balance due", value: num(invoice.total) - paid }] : undefined}
      notes={invoice.notes}
    />
  );
}
