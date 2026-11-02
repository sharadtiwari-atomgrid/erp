import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { createCustomer } from "../actions";
import { CustomerForm } from "../customer-form";

export const metadata: Metadata = { title: "New customer" };

export default async function NewCustomerPage() {
  await requireUser("customers", "edit");
  return (
    <div className="max-w-3xl">
      <PageHeader title="New customer" back={{ href: "/crm/customers", label: "Customers" }} />
      <CustomerForm action={createCustomer} cancelHref="/crm/customers" />
    </div>
  );
}
