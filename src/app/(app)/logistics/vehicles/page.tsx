import Link from "next/link";
import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { ListToolbar, Pagination } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { Prisma } from "@/generated/prisma/client";
import { VehicleOwnership, VehicleStatus } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth";
import { getBranchScope } from "@/lib/branch";
import { db } from "@/lib/db";
import { formatNumber, humanize } from "@/lib/format";
import { pagination, param } from "@/lib/forms";
import { getBranchOptions } from "@/lib/options";
import { can } from "@/lib/permissions";
import { enumParam } from "../../sales/_lib/documents";
import { ExpiryFlag, OpsBadge } from "../_components/badges";
import { fleetBranchWhere } from "../_lib/scope";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Vehicles" };

export default async function VehiclesPage({ searchParams }: PageProps<"/logistics/vehicles">) {
  const user = await requireUser("fleet");
  const sp = await searchParams;
  const q = param(sp, "q");
  const status = enumParam(VehicleStatus, param(sp, "status"));
  const ownership = enumParam(VehicleOwnership, param(sp, "ownership"));
  const branch = param(sp, "branch");
  const { page, take, skip } = pagination(sp);
  const scope = await getBranchScope();

  const where: Prisma.VehicleWhereInput = {
    AND: [
      await fleetBranchWhere(),
      q
        ? {
            OR: [
              { registrationNo: { contains: q.replace(/\s/g, ""), mode: "insensitive" } },
              { make: { contains: q, mode: "insensitive" } },
              { model: { contains: q, mode: "insensitive" } },
              { transporter: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {},
      status ? { status } : {},
      ownership ? { ownership } : {},
      branch === "none" ? { branchId: null } : branch ? { branchId: branch } : {},
    ],
  };

  const [vehicles, total, branches] = await Promise.all([
    db.vehicle.findMany({
      where,
      orderBy: { registrationNo: "asc" },
      take,
      skip,
      include: {
        transporter: { select: { id: true, name: true } },
        branch: { select: { name: true } },
        assignments: { where: { endDate: null }, take: 1, include: { driver: { select: { id: true, name: true } } } },
      },
    }),
    db.vehicle.count({ where }),
    getBranchOptions(),
  ]);
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Vehicles"
        description="Own and third-party fleet, document expiries and driver assignments."
        actions={can(user, "fleet", "edit") && <ButtonLink href="/logistics/vehicles/new">New vehicle</ButtonLink>}
      />
      <Card>
        <ListToolbar
          q={q}
          placeholder="Search registration, make, transporter"
          filter={{
            name: "status",
            value: status ?? "",
            allLabel: "All statuses",
            options: Object.values(VehicleStatus).map((s) => ({ value: s, label: humanize(s) })),
          }}
        >
          <Select name="ownership" defaultValue={ownership ?? ""} className="w-auto" aria-label="Ownership">
            <option value="">Own and third-party</option>
            <option value="OWN">Own fleet</option>
            <option value="THIRD_PARTY">Third-party</option>
          </Select>
          {!scope.locked && (
            <Select name="branch" defaultValue={branch} className="w-auto" aria-label="Branch">
              <option value="">All branches</option>
              <option value="none">Shared (no branch)</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          )}
        </ListToolbar>
        <Table>
          <THead>
            <tr>
              <TH>Registration</TH>
              <TH>Type</TH>
              <TH>Ownership</TH>
              <TH>Driver</TH>
              <TH>Branch</TH>
              <TH align="right">Capacity</TH>
              <TH>Documents</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {vehicles.length === 0 && <EmptyRow colSpan={8} />}
            {vehicles.map((v) => {
              const driver = v.assignments[0]?.driver;
              return (
                <TR key={v.id}>
                  <TD>
                    <Link href={`/logistics/vehicles/${v.id}`} className="font-mono font-medium text-brand-700 hover:underline">
                      {v.registrationNo}
                    </Link>
                    {(v.make || v.model) && <div className="text-xs text-ink-faint">{[v.make, v.model].filter(Boolean).join(" ")}</div>}
                  </TD>
                  <TD>{v.type}</TD>
                  <TD>
                    <OpsBadge status={v.ownership} />
                    {v.transporter && <div className="mt-0.5 text-xs text-ink-soft">{v.transporter.name}</div>}
                  </TD>
                  <TD>
                    {driver ? (
                      <Link href={`/logistics/drivers/${driver.id}`} className="hover:underline">
                        {driver.name}
                      </Link>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </TD>
                  <TD className="text-ink-soft">{v.branch?.name ?? "Shared"}</TD>
                  <TD align="right">{v.capacityKg ? `${formatNumber(v.capacityKg, 0)} kg` : "—"}</TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      <ExpiryFlag until={v.insuranceUntil} now={now} label="Insurance" />
                      <ExpiryFlag until={v.fitnessUntil} now={now} label="Fitness" />
                      <ExpiryFlag until={v.permitUntil} now={now} label="Permit" />
                    </div>
                  </TD>
                  <TD>
                    <OpsBadge status={v.status} />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        <Pagination page={page} pageSize={take} total={total} searchParams={sp} />
      </Card>
    </>
  );
}
