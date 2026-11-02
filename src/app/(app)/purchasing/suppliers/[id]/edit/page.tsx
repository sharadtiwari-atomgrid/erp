import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateSupplier } from "../../actions";
import { SupplierForm } from "../../supplier-form";

export const metadata: Metadata = { title: "Edit supplier" };

export default async function EditSupplierPage({ params }: PageProps<"/purchasing/suppliers/[id]/edit">) {
  await requireUser("suppliers", "edit");
  const { id } = await params;
  const supplier = await db.supplier.findUnique({ where: { id } });
  if (!supplier) notFound();

  return (
    <div className="max-w-3xl">
      <PageHeader title={`Edit ${supplier.name}`} back={{ href: `/purchasing/suppliers/${id}`, label: supplier.name }} />
      <SupplierForm action={updateSupplier.bind(null, id)} cancelHref={`/purchasing/suppliers/${id}`} initial={supplier} />
    </div>
  );
}
