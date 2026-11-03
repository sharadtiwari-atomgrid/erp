import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { getCompany } from "@/lib/options";
import { PrintDocument } from "../../../_components/print-document";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Print quotation" };

export default async function PrintQuotationPage({ params }: PageProps<"/sales/quotations/[id]/print">) {
  await requireUser("quotations");
  const { id } = await params;
  const [quotation, company] = await Promise.all([
    db.quotation.findUnique({
      where: { id },
      include: {
        customer: true,
        lines: { orderBy: { position: "asc" }, include: { product: { select: { sku: true, name: true, unit: true, hsnCode: true } } } },
      },
    }),
    getCompany(),
  ]);
  if (!quotation) notFound();
  const { customer } = quotation;

  return (
    <PrintDocument
      title="Quotation"
      backHref={`/sales/quotations/${id}`}
      company={company}
      meta={[
        { label: "Quotation no.", value: quotation.number },
        { label: "Date", value: formatDate(quotation.issueDate) },
        { label: "Valid until", value: formatDate(quotation.validUntil) },
      ]}
      party={{ ...customer, address: customer.billingAddress }}
      placeOfSupply={customer.state}
      lines={quotation.lines}
      subtotal={quotation.subtotal}
      taxTotal={quotation.taxTotal}
      total={quotation.total}
      notes={quotation.notes}
    />
  );
}
