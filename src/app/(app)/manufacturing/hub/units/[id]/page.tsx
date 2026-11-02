import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney, formatNumber, num } from "@/lib/format";
import { can } from "@/lib/permissions";
import { ActivityCard } from "../../../_components/activity-card";
import { MfgStatusBadge } from "../../../_components/badges";
import { deleteUnit } from "../../actions";
import { formatWeekdays } from "../../weekdays";

export const metadata: Metadata = { title: "Production unit" };

export default async function UnitPage({ params }: PageProps<"/manufacturing/hub/units/[id]">) {
  const user = await requireUser("hubSettings");
  const { id } = await params;
  const unit = await db.productionUnit.findUnique({
    where: { id },
    include: { branch: { select: { name: true, code: true } }, machines: { orderBy: { code: "asc" } } },
  });
  if (!unit) notFound();
  const canEdit = can(user, "hubSettings", "edit");
  const shiftHours = num(unit.shiftHours);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {unit.name} <StatusBadge status={unit.isActive ? "ACTIVE" : "INACTIVE"} />
          </span>
        }
        description={unit.code}
        back={{ href: "/manufacturing/hub", label: "Hub settings" }}
        actions={
          canEdit && (
            <>
              {unit.machines.length === 0 && (
                <ActionButton action={deleteUnit.bind(null, id)} confirmMessage={`Delete ${unit.name}?`} pendingText="Deleting…">
                  Delete
                </ActionButton>
              )}
              <ButtonLink href={`/manufacturing/hub/machines/new?unitId=${id}`} variant="secondary">
                Add machine
              </ButtonLink>
              <ButtonLink href={`/manufacturing/hub/units/${id}/edit`}>Edit</ButtonLink>
            </>
          )
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Details" />
          <CardBody>
            <DetailList
              items={[
                { label: "Branch", value: `${unit.branch.code} — ${unit.branch.name}` },
                { label: "Shifts per day", value: unit.shiftsPerDay },
                { label: "First shift starts", value: unit.shiftStart },
                { label: "Hours per shift", value: formatNumber(shiftHours, 2) },
                { label: "Daily capacity window", value: `${formatNumber(unit.shiftsPerDay * shiftHours, 2)} hours` },
                { label: "Working days", value: formatWeekdays(unit.workingDays) },
                { label: "Address", value: unit.address },
                { label: "Notes", value: unit.notes },
              ]}
            />
          </CardBody>
        </Card>
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Machines" description="Machine hours are scheduled from the unit's first shift start on its working days." />
            <Table>
              <THead>
                <tr>
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH>Type</TH>
                  <TH align="right">Hours / day</TH>
                  <TH align="right">Hourly cost</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {unit.machines.length === 0 && <EmptyRow colSpan={6}>No machines in this unit yet.</EmptyRow>}
                {unit.machines.map((m) => (
                  <TR key={m.id}>
                    <TD className="font-mono text-xs">{m.code}</TD>
                    <TD>
                      <Link href={`/manufacturing/hub/machines/${m.id}`} className="font-medium text-brand-700 hover:underline">
                        {m.name}
                      </Link>
                    </TD>
                    <TD className="text-ink-soft">{m.type ?? "—"}</TD>
                    <TD align="right">{formatNumber(m.hoursPerDay, 2)}</TD>
                    <TD align="right">{formatMoney(m.hourlyCost)}</TD>
                    <TD>
                      <MfgStatusBadge status={m.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <ActivityCard entityType="ProductionUnit" entityId={id} />
        </div>
      </div>
    </>
  );
}
