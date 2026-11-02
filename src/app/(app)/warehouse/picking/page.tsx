import Link from "next/link";
import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { ListToolbar, Pagination } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { branchWhere } from "@/lib/branch";
import { db } from "@/lib/db";
import { formatDateTime, humanize } from "@/lib/format";
import { pagination, param } from "@/lib/forms";
import { can } from "@/lib/permissions";
import type { Prisma } from "@/generated/prisma/client";
import { SessionStatus } from "@/generated/prisma/enums";
import { WarehouseStatusBadge } from "../_components/status";

export const metadata: Metadata = { title: "Picking sessions" };

export default async function PickingSessionsPage({ searchParams }: PageProps<"/warehouse/picking">) {
  const user = await requireUser("outbound");
  const sp = await searchParams;
  const q = param(sp, "q");
  const status = param(sp, "status");
  const warehouseId = param(sp, "warehouse");
  const { page, take, skip } = pagination(sp);
  const scope = await branchWhere();

  const where: Prisma.PickingSessionWhereInput = {
    warehouse: scope,
    ...(q && {
      OR: [
        { number: { contains: q, mode: "insensitive" } },
        { assignedTo: { name: { contains: q, mode: "insensitive" } } },
        { outbounds: { some: { number: { contains: q, mode: "insensitive" } } } },
      ],
    }),
    ...(Object.hasOwn(SessionStatus, status) && { status: status as SessionStatus }),
    ...(warehouseId && { warehouseId }),
  };

  const [sessions, total, warehouses] = await Promise.all([
    db.pickingSession.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take,
      skip,
      include: {
        warehouse: { select: { code: true } },
        assignedTo: { select: { name: true } },
        outbounds: { orderBy: { number: "asc" }, select: { id: true, number: true } },
      },
    }),
    db.pickingSession.count({ where }),
    db.warehouse.findMany({ where: scope, orderBy: { name: "asc" }, select: { id: true, code: true, name: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="Picking sessions"
        description="Wave picking: one picker collects stock for several outbound orders of a warehouse."
        actions={can(user, "outbound", "edit") && <ButtonLink href="/warehouse/picking/new">New picking session</ButtonLink>}
      />
      <Card>
        <ListToolbar
          q={q}
          placeholder="Search session, picker or OUT number"
          filter={{
            name: "status",
            value: status,
            allLabel: "All statuses",
            options: Object.values(SessionStatus).map((s) => ({ value: s, label: humanize(s) })),
          }}
        >
          <Select name="warehouse" defaultValue={warehouseId} className="w-auto" aria-label="Warehouse">
            <option value="">All warehouses</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} — {w.name}
              </option>
            ))}
          </Select>
        </ListToolbar>
        <Table>
          <THead>
            <tr>
              <TH>Session</TH>
              <TH>Started</TH>
              <TH>Warehouse</TH>
              <TH>Picker</TH>
              <TH>Orders</TH>
              <TH>Completed</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {sessions.length === 0 && <EmptyRow colSpan={7} />}
            {sessions.map((s) => (
              <TR key={s.id}>
                <TD>
                  <Link href={`/warehouse/picking/${s.id}`} className="font-medium text-brand-700 hover:underline">
                    {s.number}
                  </Link>
                </TD>
                <TD className="whitespace-nowrap text-ink-soft">{formatDateTime(s.startedAt)}</TD>
                <TD className="font-mono text-xs">{s.warehouse.code}</TD>
                <TD>{s.assignedTo?.name ?? <span className="text-ink-faint">Unassigned</span>}</TD>
                <TD className="text-xs">
                  {s.outbounds.length === 0 ? (
                    <span className="text-ink-faint">—</span>
                  ) : (
                    s.outbounds.map((o, i) => (
                      <span key={o.id}>
                        {i > 0 && ", "}
                        <Link href={`/warehouse/outbound/${o.id}`} className="font-mono text-brand-700 hover:underline">
                          {o.number}
                        </Link>
                      </span>
                    ))
                  )}
                </TD>
                <TD className="whitespace-nowrap text-ink-soft">{s.completedAt ? formatDateTime(s.completedAt) : "—"}</TD>
                <TD>
                  <WarehouseStatusBadge status={s.status} />
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
