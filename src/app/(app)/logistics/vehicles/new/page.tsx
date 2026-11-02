import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getBranchOptions, getTransporterOptions } from "@/lib/options";
import { createVehicle } from "../actions";
import { VehicleForm } from "../vehicle-form";

export const metadata: Metadata = { title: "New vehicle" };

export default async function NewVehiclePage() {
  await requireUser("fleet", "edit");
  const [transporters, branches] = await Promise.all([getTransporterOptions(), getBranchOptions()]);
  return (
    <div className="max-w-3xl">
      <PageHeader title="New vehicle" back={{ href: "/logistics/vehicles", label: "Vehicles" }} />
      <VehicleForm action={createVehicle} transporters={transporters} branches={branches} cancelHref="/logistics/vehicles" />
    </div>
  );
}
