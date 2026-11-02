import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { createSupplier } from "../actions";
import { SupplierForm } from "../supplier-form";

export const metadata: Metadata = { title: "New supplier" };

export default async function NewSupplierPage() {
  await requireUser("suppliers", "edit");
  return (
    <div className="max-w-3xl">
      <PageHeader title="New supplier" back={{ href: "/purchasing/suppliers", label: "Suppliers" }} />
      <SupplierForm action={createSupplier} cancelHref="/purchasing/suppliers" />
    </div>
  );
}
