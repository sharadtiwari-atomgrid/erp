import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { param } from "@/lib/forms";
import { getDriverOptions, getVehicleOptions } from "../../_lib/scope";
import { createTrip } from "../actions";
import { TripForm } from "../trip-form";

export const metadata: Metadata = { title: "Plan trip" };

export default async function NewTripPage({ searchParams }: PageProps<"/logistics/trips/new">) {
  await requireUser("trips", "edit");
  const vehicleId = param(await searchParams, "vehicleId");
  const [vehicles, drivers] = await Promise.all([getVehicleOptions({ excludeInactive: true }), getDriverOptions()]);
  return (
    <div className="max-w-3xl">
      <PageHeader title="Plan trip" back={{ href: "/logistics/trips", label: "Trips" }} />
      <TripForm action={createTrip} vehicles={vehicles} drivers={drivers} cancelHref="/logistics/trips" initial={{ vehicleId }} />
    </div>
  );
}
