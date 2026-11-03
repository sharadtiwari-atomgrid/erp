import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { toDateInput } from "@/lib/format";
import { param } from "@/lib/forms";
import { getCustomerOptions, getProductOptions } from "@/lib/options";
import { DocumentForm } from "../../_components/document-form";
import { toOptions } from "../../_lib/documents";
import { createInvoice } from "../actions";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "New invoice" };

export default async function NewInvoicePage({ searchParams }: PageProps<"/sales/invoices/new">) {
  await requireUser("invoices", "edit");
  const sp = await searchParams;
  const [customers, products] = await Promise.all([getCustomerOptions(), getProductOptions()]);

  return (
    <div className="max-w-5xl">
      <PageHeader title="New invoice" back={{ href: "/sales/invoices", label: "Invoices" }} />
      <DocumentForm
        action={createInvoice}
        products={products}
        cancelHref="/sales/invoices"
        submitLabel="Save draft invoice"
        fields={[
          { name: "customerId", label: "Customer", type: "select", required: true, options: toOptions(customers), defaultValue: param(sp, "customerId"), placeholder: "Select a customer…" },
          { name: "issueDate", label: "Invoice date", type: "date", required: true, defaultValue: toDateInput(new Date()) },
          { name: "dueDate", label: "Due date", type: "date", hint: "Blank = invoice date + customer’s payment terms" },
          { name: "placeOfSupply", label: "Place of supply (state)", type: "text", hint: "Blank = customer’s state" },
        ]}
      />
    </div>
  );
}
