import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { toDateInput } from "@/lib/format";
import { getCustomerOptions, getProductOptions } from "@/lib/options";
import { DocumentForm } from "../../../_components/document-form";
import { toLineInputs, toOptions } from "../../../_lib/documents";
import { updateQuotation } from "../../actions";

export const metadata: Metadata = { title: "Edit quotation" };

export default async function EditQuotationPage({ params }: PageProps<"/sales/quotations/[id]/edit">) {
  await requireUser("quotations", "edit");
  const { id } = await params;
  const [quotation, customers, products] = await Promise.all([
    db.quotation.findUnique({ where: { id }, include: { lines: { orderBy: { position: "asc" } } } }),
    getCustomerOptions(),
    getProductOptions(),
  ]);
  if (!quotation) notFound();
  if (quotation.status !== "DRAFT" && quotation.status !== "SENT") redirect(`/sales/quotations/${id}`);

  return (
    <div className="max-w-5xl">
      <PageHeader title={`Edit ${quotation.number}`} back={{ href: `/sales/quotations/${id}`, label: quotation.number }} />
      <DocumentForm
        action={updateQuotation.bind(null, id)}
        products={products}
        initialLines={toLineInputs(quotation.lines)}
        notes={quotation.notes}
        cancelHref={`/sales/quotations/${id}`}
        submitLabel="Save quotation"
        fields={[
          { name: "customerId", label: "Customer", type: "select", required: true, options: toOptions(customers), defaultValue: quotation.customerId, placeholder: "Select a customer…" },
          { name: "issueDate", label: "Quotation date", type: "date", required: true, defaultValue: toDateInput(quotation.issueDate) },
          { name: "validUntil", label: "Valid until", type: "date", defaultValue: toDateInput(quotation.validUntil) },
        ]}
      />
    </div>
  );
}
