import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { num, toDateInput } from "@/lib/format";
import { getBranchOptions, getTransporterOptions } from "@/lib/options";
import { updateVehicle } from "../../actions";
import { VehicleForm } from "../../vehicle-form";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Edit vehicle" };

export default async function EditVehiclePage({ params }: PageProps<"/logistics/vehicles/[id]/edit">) {
  await requireUser("fleet", "edit");
  const { id } = await params;
  const vehicle = await db.vehicle.findUnique({ where: { id } });
  if (!vehicle) notFound();
  const [transporters, branches] = await Promise.all([getTransporterOptions(vehicle.transporterId), getBranchOptions(vehicle.branchId)]);

  return (
    <div className="max-w-3xl">
      <PageHeader title={`Edit ${vehicle.registrationNo}`} back={{ href: `/logistics/vehicles/${id}`, label: vehicle.registrationNo }} />
      <VehicleForm
        action={updateVehicle.bind(null, id)}
        transporters={transporters}
        branches={branches}
        cancelHref={`/logistics/vehicles/${id}`}
        initial={{
          ...vehicle,
          capacityKg: vehicle.capacityKg === null ? null : num(vehicle.capacityKg),
          insuranceUntil: toDateInput(vehicle.insuranceUntil),
          fitnessUntil: toDateInput(vehicle.fitnessUntil),
          permitUntil: toDateInput(vehicle.permitUntil),
        }}
      />
    </div>
  );
}
