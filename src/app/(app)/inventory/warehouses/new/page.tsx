import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { createWarehouse } from "../actions";
import { WarehouseForm } from "../warehouse-form";

export const metadata: Metadata = { title: "New warehouse" };

export default async function NewWarehousePage() {
  await requireUser("warehouses", "edit");
  return (
    <div className="max-w-3xl">
      <PageHeader title="New warehouse" back={{ href: "/inventory/warehouses", label: "Warehouses" }} />
      <WarehouseForm action={createWarehouse} cancelHref="/inventory/warehouses" />
    </div>
  );
}
