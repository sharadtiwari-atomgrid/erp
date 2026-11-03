import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList, StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatNumber, num } from "@/lib/format";
import { can } from "@/lib/permissions";
import { ActivityCard } from "../../../sales/_components/activity-card";
import { ExpiryValue, OpsBadge } from "../../_components/badges";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Driver" };

export default async function DriverPage({ params }: PageProps<"/logistics/drivers/[id]">) {
  const user = await requireUser("fleet");
  const { id } = await params;
  const driver = await db.driver.findUnique({
    where: { id },
    include: {
      branch: { select: { name: true } },
      transporter: { select: { id: true, name: true } },
      assignments: { orderBy: { startDate: "desc" }, take: 10, include: { vehicle: { select: { id: true, registrationNo: true, type: true } } } },
      trips: { orderBy: { createdAt: "desc" }, take: 15, include: { vehicle: { select: { id: true, registrationNo: true } } } },
    },
  });
  if (!driver) notFound();

  const now = new Date();
  const current = driver.assignments.find((a) => a.endDate === null);
  const [tripCount, completed] = await Promise.all([
    db.trip.count({ where: { driverId: id } }),
    db.trip.findMany({ where: { driverId: id, status: "COMPLETED" }, select: { startOdometer: true, endOdometer: true } }),
  ]);
  const totalKm = completed.reduce(
    (s, t) => s + (t.startOdometer !== null && t.endOdometer !== null ? num(t.endOdometer) - num(t.startOdometer) : 0),
    0,
  );

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {driver.name} <StatusBadge status={driver.isActive ? "ACTIVE" : "INACTIVE"} />
          </span>
        }
        description={driver.phone ?? undefined}
        back={{ href: "/logistics/drivers", label: "Drivers" }}
        actions={can(user, "fleet", "edit") && <ButtonLink href={`/logistics/drivers/${id}/edit`}>Edit</ButtonLink>}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Current vehicle"
          value={current ? <span className="font-mono">{current.vehicle.registrationNo}</span> : "—"}
          hint={current ? `Since ${formatDate(current.startDate)}` : "Not assigned"}
        />
        <StatCard label="Trips" value={tripCount} hint={`${completed.length} completed`} />
        <StatCard label="Distance driven" value={`${formatNumber(totalKm, 0)} km`} hint="Completed trips" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Trips" />
            <Table>
              <THead>
                <tr>
                  <TH>Trip</TH>
                  <TH>Vehicle</TH>
                  <TH>Route</TH>
                  <TH>Start</TH>
                  <TH align="right">Distance</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {driver.trips.length === 0 && <EmptyRow colSpan={6}>No trips yet.</EmptyRow>}
                {driver.trips.map((t) => (
                  <TR key={t.id}>
                    <TD>
                      <Link href={`/logistics/trips/${t.id}`} className="font-medium text-brand-700 hover:underline">
                        {t.number}
                      </Link>
                    </TD>
                    <TD className="font-mono text-xs">{t.vehicle.registrationNo}</TD>
                    <TD>
                      {t.origin} → {t.destination}
                    </TD>
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

          <Card>
            <CardHeader title="Vehicle assignments" />
            <Table>
              <THead>
                <tr>
                  <TH>Vehicle</TH>
                  <TH>From</TH>
                  <TH>Until</TH>
                </tr>
              </THead>
              <TBody>
                {driver.assignments.length === 0 && <EmptyRow colSpan={3}>Never assigned.</EmptyRow>}
                {driver.assignments.map((a) => (
                  <TR key={a.id}>
                    <TD>
                      <Link href={`/logistics/vehicles/${a.vehicle.id}`} className="font-mono text-brand-700 hover:underline">
                        {a.vehicle.registrationNo}
                      </Link>
                      <span className="ml-2 text-xs text-ink-faint">{a.vehicle.type}</span>
                    </TD>
                    <TD>{formatDate(a.startDate)}</TD>
                    <TD>{a.endDate ? formatDate(a.endDate) : <OpsBadge status="ACTIVE" label="Current" />}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DetailList
                items={[
                  { label: "Licence no.", value: driver.licenseNo },
                  { label: "Licence valid until", value: <ExpiryValue until={driver.licenseUntil} now={now} /> },
                  { label: "Branch", value: driver.branch?.name ?? "Shared (all branches)" },
                  {
                    label: "Employer",
                    value: driver.transporter ? (
                      <Link href={`/contacts/${driver.transporter.id}`} className="text-brand-700 hover:underline">
                        {driver.transporter.name}
                      </Link>
                    ) : (
                      "Own employee"
                    ),
                  },
                ]}
              />
            </CardBody>
          </Card>
          <ActivityCard entityType="Driver" entityId={id} />
        </div>
      </div>
    </>
  );
}
