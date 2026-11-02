import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateWarehouse } from "../../actions";
import { WarehouseForm } from "../../warehouse-form";
import { getBranchOptions } from "@/lib/options";

export const metadata: Metadata = { title: "Edit warehouse" };

export default async function EditWarehousePage({ params }: PageProps<"/inventory/warehouses/[id]/edit">) {
  await requireUser("warehouses", "edit");
  const { id } = await params;
  const warehouse = await db.warehouse.findUnique({ where: { id } });
  if (!warehouse) notFound();

  return (
    <div className="max-w-3xl">
      <PageHeader title={`Edit ${warehouse.name}`} back={{ href: `/inventory/warehouses/${id}`, label: warehouse.name }} />
      <WarehouseForm action={updateWarehouse.bind(null, id)} cancelHref={`/inventory/warehouses/${id}`} initial={warehouse} branches={await getBranchOptions(warehouse.branchId)} />
    </div>
  );
}
