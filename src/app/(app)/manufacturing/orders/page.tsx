import Link from "next/link";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { ListToolbar, Pagination } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { Prisma } from "@/generated/prisma/client";
import { ProductionOrderStatus } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth";
import { branchWhere } from "@/lib/branch";
import { db } from "@/lib/db";
import { formatDate, formatNumber, humanize, num } from "@/lib/format";
import { pagination, param } from "@/lib/forms";
import { can } from "@/lib/permissions";
import { MfgStatusBadge, ModeBadge, PriorityBadge } from "../_components/badges";
import { endOfLocalDay } from "../_lib/scheduler";

export const metadata: Metadata = { title: "Production orders" };

export default async function ProductionOrdersPage({ searchParams }: PageProps<"/manufacturing/orders">) {
  const user = await requireUser("production");
  const sp = await searchParams;
  const q = param(sp, "q");
  const status = param(sp, "status");
  const mode = param(sp, "mode");
  const { page, take, skip } = pagination(sp);
  const scope = await branchWhere();

  const where: Prisma.ProductionOrderWhereInput = {
    ...scope,
    ...(q && {
      OR: [
        { number: { contains: q, mode: "insensitive" } },
        { product: { name: { contains: q, mode: "insensitive" } } },
        { product: { sku: { contains: q, mode: "insensitive" } } },
        { salesOrder: { number: { contains: q, mode: "insensitive" } } },
      ],
    }),
    ...(status === "OPEN"
      ? { status: { in: ["DRAFT", "SCHEDULED", "IN_PROGRESS"] } }
      : Object.hasOwn(ProductionOrderStatus, status) && { status: status as ProductionOrderStatus }),
    ...((mode === "MTS" || mode === "MTO" || mode === "ATO") && { mode }),
  };

  const now = new Date();
  const [orders, total, counts, overdue] = await Promise.all([
    db.productionOrder.findMany({
      where,
      orderBy: [{ priority: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }, { number: "desc" }],
      take,
      skip,
      include: {
        product: { select: { name: true, sku: true, unit: true } },
        salesOrder: { select: { id: true, number: true } },
        warehouse: { select: { code: true } },
      },
    }),
    db.productionOrder.count({ where }),
    db.productionOrder.groupBy({ by: ["status"], where: scope, _count: true }),
    db.productionOrder.count({ where: { ...scope, status: { in: ["DRAFT", "SCHEDULED", "IN_PROGRESS"] }, dueDate: { lt: now } } }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;

  return (
    <>
      <PageHeader
        title="Production orders"
        description="Make-to-stock, make-to-order and assemble-to-order production, from draft through scheduling, batches and QC."
        actions={
          <>
            <ButtonLink href="/manufacturing/schedule" variant="secondary">
              Schedule
            </ButtonLink>
            {can(user, "production", "edit") && <ButtonLink href="/manufacturing/orders/new">New production order</ButtonLink>}
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Draft" value={count("DRAFT")} />
        <StatCard label="Scheduled" value={count("SCHEDULED")} />
        <StatCard label="In progress" value={count("IN_PROGRESS")} />
        <StatCard label="Overdue" value={overdue} tone={overdue > 0 ? "danger" : "default"} hint="Open orders past their due date" />
      </div>
      <Card>
        <ListToolbar
          q={q}
          placeholder="Search number, product or sales order"
          filter={{
            name: "status",
            value: status,
            allLabel: "All statuses",
            options: [{ value: "OPEN", label: "Open (not completed)" }, ...Object.values(ProductionOrderStatus).map((s) => ({ value: s, label: humanize(s) }))],
          }}
        >
          <Select name="mode" defaultValue={mode} className="w-auto" aria-label="Mode">
            <option value="">All modes</option>
            <option value="MTS">MTS</option>
            <option value="MTO">MTO</option>
            <option value="ATO">ATO</option>
          </Select>
        </ListToolbar>
        <Table>
          <THead>
            <tr>
              <TH>Number</TH>
              <TH>Product</TH>
              <TH>Mode</TH>
              <TH align="right">Produced / qty</TH>
              <TH>Priority</TH>
              <TH>Due</TH>
              <TH>Scheduled</TH>
              <TH>Sales order</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {orders.length === 0 && <EmptyRow colSpan={9} />}
            {orders.map((o) => {
              const open = o.status === "DRAFT" || o.status === "SCHEDULED" || o.status === "IN_PROGRESS";
              const late = open && o.dueDate && o.scheduledEnd && o.scheduledEnd > endOfLocalDay(o.dueDate);
              const overdueRow = open && o.dueDate && o.dueDate < now;
              return (
                <TR key={o.id}>
                  <TD>
                    <Link href={`/manufacturing/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">
                      {o.number}
                    </Link>
                  </TD>
                  <TD>
                    {o.product.name}
                    <div className="font-mono text-xs text-ink-faint">
                      {o.product.sku} · {o.warehouse.code}
                    </div>
                  </TD>
                  <TD>
                    <ModeBadge mode={o.mode} />
                  </TD>
                  <TD align="right">
                    {formatNumber(o.producedQty)} / {formatNumber(o.quantity)} <span className="text-xs text-ink-faint">{o.product.unit}</span>
                  </TD>
                  <TD>
                    <PriorityBadge priority={o.priority} />
                  </TD>
                  <TD className={overdueRow ? "font-medium text-red-600" : "text-ink-soft"}>{formatDate(o.dueDate)}</TD>
                  <TD className="text-ink-soft">
                    {o.scheduledEnd ? `${formatDate(o.scheduledStart)} → ${formatDate(o.scheduledEnd)}` : "—"}
                    {late && (
                      <span className="ml-1">
                        <Badge tone="red">Late</Badge>
                      </span>
                    )}
                  </TD>
                  <TD>
                    {o.salesOrder ? (
                      <Link href={`/sales/orders/${o.salesOrder.id}`} className="text-brand-700 hover:underline">
                        {o.salesOrder.number}
                      </Link>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </TD>
                  <TD>
                    <MfgStatusBadge status={o.status} />
                    {o.status === "COMPLETED" && num(o.producedQty) < num(o.quantity) && <div className="mt-0.5 text-xs text-amber-700">Closed short</div>}
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
