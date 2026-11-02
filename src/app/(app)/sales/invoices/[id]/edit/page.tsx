import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { toDateInput } from "@/lib/format";
import { getCustomerOptions, getProductOptions } from "@/lib/options";
import { DocumentForm } from "../../../_components/document-form";
import { toLineInputs, toOptions } from "../../../_lib/documents";
import { updateInvoice } from "../../actions";

export const metadata: Metadata = { title: "Edit invoice" };

export default async function EditInvoicePage({ params }: PageProps<"/sales/invoices/[id]/edit">) {
  await requireUser("invoices", "edit");
  const { id } = await params;
  const [invoice, customers, products] = await Promise.all([
    db.invoice.findUnique({ where: { id }, include: { lines: { orderBy: { position: "asc" } } } }),
    getCustomerOptions(),
    getProductOptions(),
  ]);
  if (!invoice) notFound();
  if (invoice.status !== "DRAFT") redirect(`/sales/invoices/${id}`);

  return (
    <div className="max-w-5xl">
      <PageHeader title={`Edit ${invoice.number}`} back={{ href: `/sales/invoices/${id}`, label: invoice.number }} />
      <DocumentForm
        action={updateInvoice.bind(null, id)}
        products={products}
        initialLines={toLineInputs(invoice.lines)}
        notes={invoice.notes}
        cancelHref={`/sales/invoices/${id}`}
        submitLabel="Save draft invoice"
        fields={[
          { name: "customerId", label: "Customer", type: "select", required: true, options: toOptions(customers), defaultValue: invoice.customerId, placeholder: "Select a customer…" },
          { name: "issueDate", label: "Invoice date", type: "date", required: true, defaultValue: toDateInput(invoice.issueDate) },
          { name: "dueDate", label: "Due date", type: "date", defaultValue: toDateInput(invoice.dueDate), hint: "Blank = invoice date + customer’s payment terms" },
          { name: "placeOfSupply", label: "Place of supply (state)", type: "text", defaultValue: invoice.placeOfSupply ?? "", hint: "Blank = customer’s state" },
        ]}
      />
    </div>
  );
}
