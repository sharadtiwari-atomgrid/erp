import Link from "next/link";
import type { Metadata } from "next";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader, StatCard } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { Pagination } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney, formatNumber, num, toDateInput } from "@/lib/format";
import { pagination, param } from "@/lib/forms";
import { can } from "@/lib/permissions";
import { averageKmPerLitre, fuelEfficiency } from "../_lib/fleet";
import { fleetBranchWhere, getDriverOptions, getVehicleOptions } from "../_lib/scope";
import { createFuelLog } from "./actions";
import { FuelForm } from "./fuel-form";

export const metadata: Metadata = { title: "Fuel logs" };

function parseDay(value: string, endOfDay = false): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  if (endOfDay) d.setHours(23, 59, 59, 999);
  return d;
}

export default async function FuelLogsPage({ searchParams }: PageProps<"/logistics/fuel">) {
  const user = await requireUser("fleet");
  const sp = await searchParams;
  const vehicleId = param(sp, "vehicleId");
  const from = parseDay(param(sp, "from"));
  const to = parseDay(param(sp, "to"), true);
  const { page, take, skip } = pagination(sp);
  const canEdit = can(user, "fleet", "edit");

  const vehicleScope: Prisma.FuelLogWhereInput = { vehicle: await fleetBranchWhere(), ...(vehicleId && { vehicleId }) };
  const where: Prisma.FuelLogWhereInput = {
    ...vehicleScope,
    ...((from || to) && { date: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
  };

  const [logs, total, sums, readings, vehicles, drivers] = await Promise.all([
    db.fuelLog.findMany({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take,
      skip,
      include: { vehicle: { select: { id: true, registrationNo: true } }, driver: { select: { name: true } } },
    }),
    db.fuelLog.count({ where }),
    db.fuelLog.aggregate({ where, _sum: { litres: true, amount: true } }),
    // Every reading up to the end of the range, so the first fill in range can use the one before it.
    db.fuelLog.findMany({
      where: { ...vehicleScope, ...(to && { date: { lte: to } }) },
      select: { id: true, vehicleId: true, date: true, createdAt: true, litres: true, odometerKm: true },
    }),
    getVehicleOptions(),
    canEdit ? getDriverOptions() : Promise.resolve([]),
  ]);

  const efficiency = fuelEfficiency(
    readings.map((r) => ({ ...r, litres: num(r.litres), odometerKm: r.odometerKm === null ? null : num(r.odometerKm) })),
  );
  const inRange = readings.filter((r) => !from || r.date >= from).map((r) => efficiency.get(r.id)).filter((e) => e !== undefined);
  const avgKmpl = averageKmPerLitre(inRange);
  const litres = num(sums._sum.litres);
  const amount = num(sums._sum.amount);

  return (
    <>
      <PageHeader title="Fuel logs" description="Fuel purchases per vehicle, with mileage worked out from odometer readings." />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Fills" value={total} />
        <StatCard label="Litres" value={formatNumber(litres, 2)} />
        <StatCard label="Amount" value={formatMoney(amount)} hint={litres > 0 ? `${formatMoney(amount / litres)} per litre` : undefined} />
        <StatCard label="Average km/l" value={avgKmpl === null ? "—" : formatNumber(avgKmpl, 2)} hint="Fills with odometer readings" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <form className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3" role="search">
            <Select name="vehicleId" defaultValue={vehicleId} className="w-auto" aria-label="Vehicle">
              <option value="">All vehicles</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.registrationNo}
                </option>
              ))}
            </Select>
            <Input type="date" name="from" defaultValue={from ? toDateInput(from) : ""} className="w-auto" aria-label="From date" />
            <span className="text-xs text-ink-faint">to</span>
            <Input type="date" name="to" defaultValue={to ? toDateInput(to) : ""} className="w-auto" aria-label="To date" />
            <button type="submit" className={buttonClass("secondary")}>
              Apply
            </button>
          </form>
          <Table>
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Vehicle</TH>
                <TH>Driver</TH>
                <TH>Station</TH>
                <TH align="right">Odometer</TH>
                <TH align="right">Litres</TH>
                <TH align="right">Amount</TH>
                <TH align="right">km/l</TH>
              </tr>
            </THead>
            <TBody>
              {logs.length === 0 && <EmptyRow colSpan={8}>No fuel logs for these filters.</EmptyRow>}
              {logs.map((l) => {
                const e = efficiency.get(l.id);
                return (
                  <TR key={l.id}>
                    <TD>{formatDate(l.date)}</TD>
                    <TD>
                      <Link href={`/logistics/vehicles/${l.vehicle.id}`} className="font-mono text-brand-700 hover:underline">
                        {l.vehicle.registrationNo}
                      </Link>
                    </TD>
                    <TD className="text-ink-soft">{l.driver?.name ?? "—"}</TD>
                    <TD className="text-ink-soft">{l.station ?? "—"}</TD>
                    <TD align="right">{l.odometerKm === null ? "—" : formatNumber(l.odometerKm, 1)}</TD>
                    <TD align="right">{formatNumber(l.litres, 2)}</TD>
                    <TD align="right">{formatMoney(l.amount)}</TD>
                    <TD align="right" title={e ? `${formatNumber(e.distanceKm, 1)} km since previous fill` : undefined}>
                      {e ? formatNumber(e.kmPerLitre, 2) : "—"}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <Pagination page={page} pageSize={take} total={total} searchParams={sp} />
        </Card>

        {canEdit && (
          <Card className="h-fit lg:col-span-1">
            <CardHeader title="Quick add" description="Record a fill. Add the odometer reading to track mileage." />
            <CardBody>
              <FuelForm
                action={createFuelLog}
                vehicles={vehicles.filter((v) => v.status !== "INACTIVE")}
                drivers={drivers}
                defaultVehicleId={vehicleId || undefined}
                today={toDateInput(new Date())}
              />
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
