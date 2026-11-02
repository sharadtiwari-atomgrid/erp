import Link from "next/link";
import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { branchWhere } from "@/lib/branch";
import { db } from "@/lib/db";
import { formatMoney, formatNumber } from "@/lib/format";
import { can } from "@/lib/permissions";
import { HubTabs } from "../../_components/hub-tabs";
import { MfgStatusBadge } from "../../_components/badges";
import { dailyLoad, toSchedulerMachine, utilisationPct } from "../../_lib/capacity";

export const metadata: Metadata = { title: "Machines" };

const WINDOW_DAYS = 7;

export default async function MachinesPage() {
  const user = await requireUser("hubSettings");
  const scope = await branchWhere();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const until = new Date(today.getFullYear(), today.getMonth(), today.getDate() + WINDOW_DAYS);

  const machines = await db.machine.findMany({
    where: { productionUnit: scope },
    orderBy: [{ productionUnit: { name: "asc" } }, { code: "asc" }],
    include: {
      productionUnit: { select: { id: true, name: true, shiftStart: true, workingDays: true, isActive: true } },
      scheduleSlots: { where: { end: { gt: today }, start: { lt: until } }, select: { start: true, end: true } },
      _count: { select: { operations: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Hub settings"
        description="Machines, their daily capacity and cost. Utilisation covers the next 7 days of the schedule."
        actions={can(user, "hubSettings", "edit") && <ButtonLink href="/manufacturing/hub/machines/new">New machine</ButtonLink>}
      />
      <HubTabs active="machines" />
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Code</TH>
              <TH>Name</TH>
              <TH>Unit</TH>
              <TH>Type</TH>
              <TH align="right">Hours / day</TH>
              <TH align="right">Hourly cost</TH>
              <TH align="right">BOM ops</TH>
              <TH align="right">Next 7 days</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {machines.length === 0 && <EmptyRow colSpan={9}>No machines yet.</EmptyRow>}
            {machines.map((m) => {
              const pct = utilisationPct(dailyLoad(toSchedulerMachine(m), m.scheduleSlots, today, WINDOW_DAYS));
              return (
                <TR key={m.id}>
                  <TD className="font-mono text-xs">{m.code}</TD>
                  <TD>
                    <Link href={`/manufacturing/hub/machines/${m.id}`} className="font-medium text-brand-700 hover:underline">
                      {m.name}
                    </Link>
                  </TD>
                  <TD>
                    <Link href={`/manufacturing/hub/units/${m.productionUnit.id}`} className="text-ink-soft hover:underline">
                      {m.productionUnit.name}
                    </Link>
                  </TD>
                  <TD className="text-ink-soft">{m.type ?? "—"}</TD>
                  <TD align="right">{formatNumber(m.hoursPerDay, 2)}</TD>
                  <TD align="right">{formatMoney(m.hourlyCost)}</TD>
                  <TD align="right">{m._count.operations}</TD>
                  <TD align="right">
                    <UtilisationBar pct={pct} />
                  </TD>
                  <TD>
                    <MfgStatusBadge status={m.status} />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </>
  );
}

function UtilisationBar({ pct }: { pct: number }) {
  const tone = pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-brand-500";
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <span className={`block h-full ${tone}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
      <span className="w-9 text-right tabular-nums">{pct}%</span>
    </span>
  );
}
