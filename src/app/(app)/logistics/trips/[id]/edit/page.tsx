import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { num } from "@/lib/format";
import { toIstDateTimeInput } from "../../../../books/_lib/eway";
import { getDriverOptions, getVehicleOptions } from "../../../_lib/scope";
import { updateTrip } from "../../actions";
import { TripForm } from "../../trip-form";

export const metadata: Metadata = { title: "Edit trip" };

export default async function EditTripPage({ params }: PageProps<"/logistics/trips/[id]/edit">) {
  await requireUser("trips", "edit");
  const { id } = await params;
  const trip = await db.trip.findUnique({ where: { id } });
  if (!trip) notFound();
  if (trip.status !== "PLANNED") redirect(`/logistics/trips/${id}`);
  const [vehicles, drivers] = await Promise.all([
    getVehicleOptions({ excludeInactive: true, includeId: trip.vehicleId }),
    getDriverOptions(trip.driverId),
  ]);

  return (
    <div className="max-w-3xl">
      <PageHeader title={`Edit ${trip.number}`} back={{ href: `/logistics/trips/${id}`, label: trip.number }} />
      <TripForm
        action={updateTrip.bind(null, id)}
        vehicles={vehicles}
        drivers={drivers}
        cancelHref={`/logistics/trips/${id}`}
        initial={{
          ...trip,
          plannedStart: trip.plannedStart ? toIstDateTimeInput(trip.plannedStart) : "",
          freightCost: num(trip.freightCost),
        }}
      />
    </div>
  );
}
