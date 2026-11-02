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
import { formatDate, formatNumber, humanize, num } from "@/lib/format";
import { pagination, param } from "@/lib/forms";
import { can } from "@/lib/permissions";
import type { Prisma } from "@/generated/prisma/client";
import { OutboundStatus } from "@/generated/prisma/enums";
import { WarehouseStatusBadge } from "../_components/status";

export const metadata: Metadata = { title: "Outbound" };

export default async function OutboundPage({ searchParams }: PageProps<"/warehouse/outbound">) {
  const user = await requireUser("outbound");
  const sp = await searchParams;
  const q = param(sp, "q");
  const status = param(sp, "status");
  const warehouseId = param(sp, "warehouse");
  const { page, take, skip } = pagination(sp);
  const scope = await branchWhere();

  const where: Prisma.OutboundOrderWhereInput = {
    ...scope,
    ...(q && {
      OR: [
        { number: { contains: q, mode: "insensitive" } },
        { salesOrder: { number: { contains: q, mode: "insensitive" } } },
        { salesOrder: { customer: { name: { contains: q, mode: "insensitive" } } } },
      ],
    }),
    ...(Object.hasOwn(OutboundStatus, status) && { status: status as OutboundStatus }),
    ...(warehouseId && { warehouseId }),
  };

  const [outbounds, total, warehouses, counts] = await Promise.all([
    db.outboundOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: {
        salesOrder: { select: { id: true, number: true, customer: { select: { name: true } } } },
        warehouse: { select: { code: true } },
        pickingSession: { select: { id: true, number: true } },
        lines: { select: { quantity: true, pickedQty: true } },
        _count: { select: { handlingUnits: true } },
      },
    }),
    db.outboundOrder.count({ where }),
    db.warehouse.findMany({ where: scope, orderBy: { name: "asc" }, select: { id: true, code: true, name: true } }),
    db.outboundOrder.groupBy({ by: ["status"], where: scope, _count: true }),
  ]);
  const count = (s: OutboundStatus) => counts.find((c) => c.status === s)?._count ?? 0;
  const canEdit = can(user, "outbound", "edit");

  return (
    <>
      <PageHeader
        title="Outbound"
        description={`Pick, pack and dispatch sales orders. ${count("PENDING")} pending, ${count("PICKING") + count("PICKED")} in picking, ${count("PACKING") + count("PACKED")} in packing.`}
        actions={
          <>
            {canEdit && (
              <ButtonLink href="/warehouse/picking/new" variant="secondary">
                New picking session
              </ButtonLink>
            )}
            {(canEdit || can(user, "salesOrders", "edit")) && <ButtonLink href="/warehouse/outbound/new">New outbound order</ButtonLink>}
          </>
        }
      />
      <Card>
        <ListToolbar
          q={q}
          placeholder="Search OUT, SO or customer"
          filter={{
            name: "status",
            value: status,
            allLabel: "All statuses",
            options: Object.values(OutboundStatus).map((s) => ({ value: s, label: humanize(s) })),
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
              <TH>Outbound</TH>
              <TH>Created</TH>
              <TH>Sales order</TH>
              <TH>Customer</TH>
              <TH>Warehouse</TH>
              <TH align="right">Qty</TH>
              <TH align="right">Picked</TH>
              <TH align="right">HUs</TH>
              <TH>Session</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {outbounds.length === 0 && <EmptyRow colSpan={10} />}
            {outbounds.map((o) => (
              <TR key={o.id}>
                <TD>
                  <Link href={`/warehouse/outbound/${o.id}`} className="font-medium text-brand-700 hover:underline">
                    {o.number}
                  </Link>
                </TD>
                <TD className="whitespace-nowrap text-ink-soft">{formatDate(o.createdAt)}</TD>
                <TD>
                  <Link href={`/sales/orders/${o.salesOrder.id}`} className="text-brand-700 hover:underline">
                    {o.salesOrder.number}
                  </Link>
                </TD>
                <TD>{o.salesOrder.customer.name}</TD>
                <TD className="font-mono text-xs">{o.warehouse.code}</TD>
                <TD align="right">{formatNumber(o.lines.reduce((s, l) => s + num(l.quantity), 0))}</TD>
                <TD align="right">{formatNumber(o.lines.reduce((s, l) => s + num(l.pickedQty), 0))}</TD>
                <TD align="right">{o._count.handlingUnits}</TD>
                <TD>
                  {o.pickingSession ? (
                    <Link href={`/warehouse/picking/${o.pickingSession.id}`} className="font-mono text-xs text-brand-700 hover:underline">
                      {o.pickingSession.number}
                    </Link>
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </TD>
                <TD>
                  <WarehouseStatusBadge status={o.status} />
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
