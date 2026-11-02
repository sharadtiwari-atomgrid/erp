import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { addDays, toDateInput } from "@/lib/format";
import { param } from "@/lib/forms";
import { getCustomerOptions, getProductOptions } from "@/lib/options";
import { DocumentForm } from "../../_components/document-form";
import { toOptions } from "../../_lib/documents";
import { createQuotation } from "../actions";

export const metadata: Metadata = { title: "New quotation" };

export default async function NewQuotationPage({ searchParams }: PageProps<"/sales/quotations/new">) {
  await requireUser("quotations", "edit");
  const sp = await searchParams;
  const [customers, products] = await Promise.all([getCustomerOptions(), getProductOptions()]);
  const today = new Date();

  return (
    <div className="max-w-5xl">
      <PageHeader title="New quotation" back={{ href: "/sales/quotations", label: "Quotations" }} />
      <DocumentForm
        action={createQuotation}
        products={products}
        cancelHref="/sales/quotations"
        submitLabel="Save quotation"
        fields={[
          { name: "customerId", label: "Customer", type: "select", required: true, options: toOptions(customers), defaultValue: param(sp, "customerId"), placeholder: "Select a customer…" },
          { name: "issueDate", label: "Quotation date", type: "date", required: true, defaultValue: toDateInput(today) },
          { name: "validUntil", label: "Valid until", type: "date", defaultValue: toDateInput(addDays(today, 15)) },
        ]}
      />
    </div>
  );
}
