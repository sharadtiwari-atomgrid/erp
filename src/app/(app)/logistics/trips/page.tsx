import Link from "next/link";
import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListToolbar, Pagination } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { Prisma } from "@/generated/prisma/client";
import { TripStatus } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth";
import { branchWhere } from "@/lib/branch";
import { db } from "@/lib/db";
import { formatDateTime, formatMoney, formatNumber, humanize, num } from "@/lib/format";
import { pagination, param } from "@/lib/forms";
import { can } from "@/lib/permissions";
import { enumParam } from "../../sales/_lib/documents";
import { OpsBadge } from "../_components/badges";

export const metadata: Metadata = { title: "Trips" };

export default async function TripsPage({ searchParams }: PageProps<"/logistics/trips">) {
  const user = await requireUser("trips");
  const sp = await searchParams;
  const q = param(sp, "q");
  const status = enumParam(TripStatus, param(sp, "status"));
  const { page, take, skip } = pagination(sp);

  const where: Prisma.TripWhereInput = {
    ...(await branchWhere()),
    ...(status && { status }),
    ...(q && {
      OR: [
        { number: { contains: q, mode: "insensitive" } },
        { origin: { contains: q, mode: "insensitive" } },
        { destination: { contains: q, mode: "insensitive" } },
        { vehicle: { registrationNo: { contains: q.replace(/\s/g, ""), mode: "insensitive" } } },
        { driver: { name: { contains: q, mode: "insensitive" } } },
      ],
    }),
  };

  const [trips, total] = await Promise.all([
    db.trip.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: {
        vehicle: { select: { id: true, registrationNo: true } },
        driver: { select: { name: true } },
        _count: { select: { outbounds: true } },
      },
    }),
    db.trip.count({ where }),
  ]);

  return (
    <>
      <PageHeader
        title="Trips"
        description="Plan vehicle runs, load packed outbound orders and track them from start to delivery."
        actions={can(user, "trips", "edit") && <ButtonLink href="/logistics/trips/new">Plan trip</ButtonLink>}
      />
      <Card>
        <ListToolbar
          q={q}
          placeholder="Search number, route, vehicle, driver"
          filter={{
            name: "status",
            value: status ?? "",
            allLabel: "All statuses",
            options: Object.values(TripStatus).map((s) => ({ value: s, label: humanize(s) })),
          }}
        />
        <Table>
          <THead>
            <tr>
              <TH>Trip</TH>
              <TH>Route</TH>
              <TH>Vehicle</TH>
              <TH>Driver</TH>
              <TH>Start</TH>
              <TH align="right">Orders</TH>
              <TH align="right">Distance</TH>
              <TH align="right">Freight</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {trips.length === 0 && <EmptyRow colSpan={9} />}
            {trips.map((t) => (
              <TR key={t.id}>
                <TD>
                  <Link href={`/logistics/trips/${t.id}`} className="font-medium text-brand-700 hover:underline">
                    {t.number}
                  </Link>
                </TD>
                <TD>
                  {t.origin} → {t.destination}
                </TD>
                <TD>
                  <Link href={`/logistics/vehicles/${t.vehicle.id}`} className="font-mono text-xs hover:underline">
                    {t.vehicle.registrationNo}
                  </Link>
                </TD>
                <TD className="text-ink-soft">{t.driver?.name ?? "—"}</TD>
                <TD className="text-ink-soft">
                  {t.actualStart ? formatDateTime(t.actualStart) : t.plannedStart ? `Planned ${formatDateTime(t.plannedStart)}` : "—"}
                </TD>
                <TD align="right">{t._count.outbounds}</TD>
                <TD align="right">
                  {t.startOdometer !== null && t.endOdometer !== null ? `${formatNumber(num(t.endOdometer) - num(t.startOdometer), 1)} km` : "—"}
                </TD>
                <TD align="right">{formatMoney(t.freightCost)}</TD>
                <TD>
                  <OpsBadge status={t.status} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <Pagination page={page} pageSize={take} total={total} searchParams={sp} />
      </Card>
    </>
  );
}
