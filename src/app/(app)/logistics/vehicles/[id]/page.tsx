import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList, StatCard } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney, formatNumber, num } from "@/lib/format";
import { can } from "@/lib/permissions";
import { ActivityCard } from "../../../sales/_components/activity-card";
import { ExpiryValue, OpsBadge } from "../../_components/badges";
import { averageKmPerLitre, fuelEfficiency } from "../../_lib/fleet";
import { getDriverOptions } from "../../_lib/scope";
import { assignDriver, endAssignment } from "../actions";

export const metadata: Metadata = { title: "Vehicle" };

export default async function VehiclePage({ params }: PageProps<"/logistics/vehicles/[id]">) {
  const user = await requireUser("fleet");
  const { id } = await params;
  const vehicle = await db.vehicle.findUnique({
    where: { id },
    include: {
      transporter: { select: { id: true, name: true, phone: true } },
      branch: { select: { name: true } },
      assignments: { orderBy: { startDate: "desc" }, take: 6, include: { driver: { select: { id: true, name: true, phone: true } } } },
      fuelLogs: { orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 40, include: { driver: { select: { name: true } } } },
      trips: { orderBy: { createdAt: "desc" }, take: 10, include: { driver: { select: { name: true } } } },
    },
  });
  if (!vehicle) notFound();

  const canEdit = can(user, "fleet", "edit");
  const now = new Date();
  const current = vehicle.assignments.find((a) => a.endDate === null);
  const drivers = canEdit ? await getDriverOptions() : [];

  const efficiency = fuelEfficiency(
    vehicle.fuelLogs.map((l) => ({
      id: l.id,
      vehicleId: l.vehicleId,
      date: l.date,
      createdAt: l.createdAt,
      litres: num(l.litres),
      odometerKm: l.odometerKm === null ? null : num(l.odometerKm),
    })),
  );
  const recentFuel = vehicle.fuelLogs.slice(0, 10);
  const avgKmpl = averageKmPerLitre(recentFuel.map((l) => efficiency.get(l.id)).filter((e) => e !== undefined));
  const completedKm = vehicle.trips.reduce(
    (s, t) => s + (t.endOdometer !== null && t.startOdometer !== null ? num(t.endOdometer) - num(t.startOdometer) : 0),
    0,
  );

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span className="font-mono">{vehicle.registrationNo}</span> <OpsBadge status={vehicle.status} /> <OpsBadge status={vehicle.ownership} />
          </span>
        }
        description={[vehicle.type, vehicle.make, vehicle.model].filter(Boolean).join(" · ")}
        back={{ href: "/logistics/vehicles", label: "Vehicles" }}
        actions={
          <>
            {can(user, "trips", "edit") && vehicle.status === "AVAILABLE" && (
              <ButtonLink href={`/logistics/trips/new?vehicleId=${id}`} variant="secondary">
                Plan trip
              </ButtonLink>
            )}
            {canEdit && (
              <ButtonLink href={`/logistics/fuel?vehicleId=${id}`} variant="secondary">
                Log fuel
              </ButtonLink>
            )}
            {canEdit && <ButtonLink href={`/logistics/vehicles/${id}/edit`}>Edit</ButtonLink>}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Current driver" value={current ? current.driver.name : "—"} hint={current ? `Since ${formatDate(current.startDate)}` : "Not assigned"} />
        <StatCard label="Operating hours" value={vehicle.operatingStart && vehicle.operatingEnd ? `${vehicle.operatingStart}–${vehicle.operatingEnd}` : "—"} />
        <StatCard label="Average km/l" value={avgKmpl === null ? "—" : formatNumber(avgKmpl, 2)} hint="Last 10 fuel logs" />
        <StatCard label="Distance on recent trips" value={`${formatNumber(completedKm, 0)} km`} hint={`${vehicle.trips.length} recent trip${vehicle.trips.length === 1 ? "" : "s"}`} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="Fuel logs"
              description="km/l uses the distance since the previous fill with an odometer reading."
              actions={
                <Link href={`/logistics/fuel?vehicleId=${id}`} className="text-xs font-medium text-brand-700 hover:underline">
                  All fuel logs
                </Link>
              }
            />
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Driver</TH>
                  <TH>Station</TH>
                  <TH align="right">Odometer</TH>
                  <TH align="right">Litres</TH>
                  <TH align="right">Amount</TH>
                  <TH align="right">km/l</TH>
                </tr>
              </THead>
              <TBody>
                {recentFuel.length === 0 && <EmptyRow colSpan={7}>No fuel logged yet.</EmptyRow>}
                {recentFuel.map((l) => {
                  const e = efficiency.get(l.id);
                  return (
                    <TR key={l.id}>
                      <TD>{formatDate(l.date)}</TD>
                      <TD className="text-ink-soft">{l.driver?.name ?? "—"}</TD>
                      <TD className="text-ink-soft">{l.station ?? "—"}</TD>
                      <TD align="right">{l.odometerKm === null ? "—" : `${formatNumber(l.odometerKm, 1)} km`}</TD>
                      <TD align="right">{formatNumber(l.litres, 2)}</TD>
                      <TD align="right">{formatMoney(l.amount)}</TD>
                      <TD align="right">{e ? formatNumber(e.kmPerLitre, 2) : "—"}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Card>

          <Card>
            <CardHeader title="Recent trips" />
            <Table>
              <THead>
                <tr>
                  <TH>Trip</TH>
                  <TH>Route</TH>
                  <TH>Driver</TH>
                  <TH>Start</TH>
                  <TH align="right">Distance</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {vehicle.trips.length === 0 && <EmptyRow colSpan={6}>No trips yet.</EmptyRow>}
                {vehicle.trips.map((t) => (
                  <TR key={t.id}>
                    <TD>
                      <Link href={`/logistics/trips/${t.id}`} className="font-medium text-brand-700 hover:underline">
                        {t.number}
                      </Link>
                    </TD>
                    <TD>
                      {t.origin} → {t.destination}
                    </TD>
                    <TD className="text-ink-soft">{t.driver?.name ?? "—"}</TD>
                    <TD className="text-ink-soft">{formatDate(t.actualStart ?? t.plannedStart)}</TD>
                    <TD align="right">
                      {t.endOdometer !== null && t.startOdometer !== null ? `${formatNumber(num(t.endOdometer) - num(t.startOdometer), 1)} km` : "—"}
                    </TD>
                    <TD>
                      <OpsBadge status={t.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader title="Driver assignment" />
            <CardBody className="space-y-4">
              {current ? (
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link href={`/logistics/drivers/${current.driver.id}`} className="font-medium text-brand-700 hover:underline">
                      {current.driver.name}
                    </Link>
                    <p className="text-xs text-ink-faint">
                      {current.driver.phone ?? "No phone"} · since {formatDate(current.startDate)}
                    </p>
                  </div>
                  {canEdit && (
                    <ActionButton action={endAssignment.bind(null, current.id)} size="sm" variant="ghost" confirmMessage="End this assignment?">
                      End
                    </ActionButton>
                  )}
                </div>
              ) : (
                <p className="text-sm text-ink-faint">No driver assigned.</p>
              )}
              {canEdit && (
                <ActionButton
                  action={assignDriver.bind(null, id)}
                  size="sm"
                  pendingText="Assigning…"
                  fields={
                    <Select name="driverId" defaultValue="" className="h-8 w-48 text-xs" aria-label="Driver" required>
                      <option value="">Choose driver…</option>
                      {drivers
                        .filter((d) => d.id !== current?.driverId)
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                    </Select>
                  }
                >
                  {current ? "Reassign" : "Assign"}
                </ActionButton>
              )}
              {vehicle.assignments.some((a) => a.endDate) && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">History</p>
                  <ul className="mt-1 space-y-1 text-xs text-ink-soft">
                    {vehicle.assignments
                      .filter((a) => a.endDate)
                      .map((a) => (
                        <li key={a.id}>
                          {a.driver.name}: {formatDate(a.startDate)} – {formatDate(a.endDate)}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Documents" description="Flagged when expired or expiring within 30 days." />
            <CardBody>
              <DetailList
                items={[
                  { label: "Insurance", value: <ExpiryValue until={vehicle.insuranceUntil} now={now} /> },
                  { label: "Fitness", value: <ExpiryValue until={vehicle.fitnessUntil} now={now} /> },
                  { label: "Permit", value: <ExpiryValue until={vehicle.permitUntil} now={now} /> },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DetailList
                items={[
                  { label: "Branch", value: vehicle.branch?.name ?? "Shared (all branches)" },
                  { label: "Capacity", value: vehicle.capacityKg ? `${formatNumber(vehicle.capacityKg, 2)} kg` : null },
                  {
                    label: "Transporter",
                    value: vehicle.transporter && (
                      <Link href={`/contacts/${vehicle.transporter.id}`} className="text-brand-700 hover:underline">
                        {vehicle.transporter.name}
                      </Link>
                    ),
                  },
                  { label: "Notes", value: vehicle.notes },
                ]}
              />
            </CardBody>
          </Card>
          <ActivityCard entityType="Vehicle" entityId={id} />
        </div>
      </div>
    </>
  );
}
