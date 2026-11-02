import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { num } from "@/lib/format";
import { updateCustomer } from "../../actions";
import { CustomerForm } from "../../customer-form";

export const metadata: Metadata = { title: "Edit customer" };

export default async function EditCustomerPage({ params }: PageProps<"/crm/customers/[id]/edit">) {
  await requireUser("customers", "edit");
  const { id } = await params;
  const customer = await db.customer.findUnique({ where: { id } });
  if (!customer) notFound();

  return (
    <div className="max-w-3xl">
      <PageHeader title={`Edit ${customer.name}`} back={{ href: `/crm/customers/${id}`, label: customer.name }} />
      <CustomerForm
        action={updateCustomer.bind(null, id)}
        cancelHref={`/crm/customers/${id}`}
        initial={{ ...customer, creditLimit: num(customer.creditLimit) }}
      />
    </div>
  );
}
