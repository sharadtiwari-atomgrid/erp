import Link from "next/link";
import type { Metadata } from "next";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListToolbar, Pagination } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { pagination, param } from "@/lib/forms";
import { can } from "@/lib/permissions";
import { ExpiryValue } from "../_components/badges";
import { fleetBranchWhere } from "../_lib/scope";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Drivers" };

export default async function DriversPage({ searchParams }: PageProps<"/logistics/drivers">) {
  const user = await requireUser("fleet");
  const sp = await searchParams;
  const q = param(sp, "q");
  const status = param(sp, "status");
  const { page, take, skip } = pagination(sp);

  const where: Prisma.DriverWhereInput = {
    AND: [
      await fleetBranchWhere(),
      q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
              { licenseNo: { contains: q, mode: "insensitive" } },
            ],
          }
        : {},
      status === "ACTIVE" ? { isActive: true } : status === "INACTIVE" ? { isActive: false } : {},
    ],
  };

  const [drivers, total] = await Promise.all([
    db.driver.findMany({
      where,
      orderBy: { name: "asc" },
      take,
      skip,
      include: {
        branch: { select: { name: true } },
        transporter: { select: { name: true } },
        assignments: { where: { endDate: null }, take: 1, include: { vehicle: { select: { id: true, registrationNo: true } } } },
        _count: { select: { trips: true } },
      },
    }),
    db.driver.count({ where }),
  ]);
  const now = new Date();

  return (
    <>
      <PageHeader
        title="Drivers"
        description="Driver records, licence validity and vehicle assignments."
        actions={can(user, "fleet", "edit") && <ButtonLink href="/logistics/drivers/new">New driver</ButtonLink>}
      />
      <Card>
        <ListToolbar
          q={q}
          placeholder="Search name, phone, licence"
          filter={{
            name: "status",
            value: status,
            allLabel: "Active and inactive",
            options: [
              { value: "ACTIVE", label: "Active" },
              { value: "INACTIVE", label: "Inactive" },
            ],
          }}
        />
        <Table>
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Phone</TH>
              <TH>Licence</TH>
              <TH>Licence valid until</TH>
              <TH>Current vehicle</TH>
              <TH>Branch</TH>
              <TH align="right">Trips</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {drivers.length === 0 && <EmptyRow colSpan={8} />}
            {drivers.map((d) => {
              const vehicle = d.assignments[0]?.vehicle;
              return (
                <TR key={d.id}>
                  <TD>
                    <Link href={`/logistics/drivers/${d.id}`} className="font-medium text-brand-700 hover:underline">
                      {d.name}
                    </Link>
                    {d.transporter && <div className="text-xs text-ink-faint">{d.transporter.name}</div>}
                  </TD>
                  <TD className="text-ink-soft">{d.phone ?? "—"}</TD>
                  <TD className="font-mono text-xs">{d.licenseNo ?? "—"}</TD>
                  <TD>
                    <ExpiryValue until={d.licenseUntil} now={now} />
                  </TD>
                  <TD>
                    {vehicle ? (
                      <Link href={`/logistics/vehicles/${vehicle.id}`} className="font-mono hover:underline">
                        {vehicle.registrationNo}
                      </Link>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </TD>
                  <TD className="text-ink-soft">{d.branch?.name ?? "Shared"}</TD>
                  <TD align="right">{d._count.trips}</TD>
                  <TD>
                    <StatusBadge status={d.isActive ? "ACTIVE" : "INACTIVE"} />
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
