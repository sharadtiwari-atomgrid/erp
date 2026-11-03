import Link from "next/link";
import type { Metadata } from "next";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { branchWhere } from "@/lib/branch";
import { db } from "@/lib/db";
import { formatNumber, num } from "@/lib/format";
import { can } from "@/lib/permissions";
import { HubTabs } from "../_components/hub-tabs";
import { formatWeekdays } from "./weekdays";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Hub settings" };

export default async function HubPage() {
  const user = await requireUser("hubSettings");
  const scope = await branchWhere();
  const [units, machineCount, bomCount] = await Promise.all([
    db.productionUnit.findMany({
      where: scope,
      orderBy: { name: "asc" },
      include: { branch: { select: { code: true, name: true } }, _count: { select: { machines: true } } },
    }),
    db.machine.count({ where: { productionUnit: scope } }),
    db.bom.count({ where: { isActive: true } }),
  ]);
  const canEdit = can(user, "hubSettings", "edit");

  return (
    <>
      <PageHeader
        title="Hub settings"
        description="Static factory information used by production orders and the scheduler: units, machines and bills of materials."
        actions={canEdit && <ButtonLink href="/manufacturing/hub/units/new">New production unit</ButtonLink>}
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Production units" value={units.length} />
        <StatCard label="Machines" value={<Link href="/manufacturing/hub/machines" className="hover:underline">{machineCount}</Link>} />
        <StatCard label="Active BOMs" value={<Link href="/manufacturing/hub/boms" className="hover:underline">{bomCount}</Link>} />
      </div>
      <HubTabs active="units" />
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Code</TH>
              <TH>Name</TH>
              <TH>Branch</TH>
              <TH>Shifts</TH>
              <TH>Working days</TH>
              <TH align="right">Machines</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {units.length === 0 && <EmptyRow colSpan={7}>No production units yet.</EmptyRow>}
            {units.map((u) => (
              <TR key={u.id}>
                <TD className="font-mono text-xs text-ink-soft">{u.code}</TD>
                <TD>
                  <Link href={`/manufacturing/hub/units/${u.id}`} className="font-medium text-brand-700 hover:underline">
                    {u.name}
                  </Link>
                </TD>
                <TD className="text-ink-soft">{u.branch.name}</TD>
                <TD className="tabular-nums">
                  {u.shiftsPerDay} × {formatNumber(num(u.shiftHours), 2)}h from {u.shiftStart}
                </TD>
                <TD className="text-ink-soft">{formatWeekdays(u.workingDays)}</TD>
                <TD align="right">{u._count.machines}</TD>
                <TD>
                  <StatusBadge status={u.isActive ? "ACTIVE" : "INACTIVE"} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
