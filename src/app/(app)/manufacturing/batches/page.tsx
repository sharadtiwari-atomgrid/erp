import Link from "next/link";
import type { Metadata } from "next";
import { Card, StatCard } from "@/components/ui/card";
import { ListToolbar, Pagination } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { Prisma } from "@/generated/prisma/client";
import { BatchStatus } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth";
import { branchWhere } from "@/lib/branch";
import { db } from "@/lib/db";
import { formatDateTime, formatNumber, humanize } from "@/lib/format";
import { pagination, param } from "@/lib/forms";
import { MfgStatusBadge } from "../_components/badges";

export const metadata: Metadata = { title: "Production batches" };

export default async function BatchesPage({ searchParams }: PageProps<"/manufacturing/batches">) {
  await requireUser("production");
  const sp = await searchParams;
  const q = param(sp, "q");
  const status = param(sp, "status");
  const { page, take, skip } = pagination(sp);
  const scope = await branchWhere();

  const where: Prisma.ProductionBatchWhereInput = {
    productionOrder: scope,
    ...(q && {
      OR: [
        { number: { contains: q, mode: "insensitive" } },
        { productionOrder: { number: { contains: q, mode: "insensitive" } } },
        { productionOrder: { product: { name: { contains: q, mode: "insensitive" } } } },
      ],
    }),
    ...(Object.hasOwn(BatchStatus, status) && { status: status as BatchStatus }),
  };

  const [batches, total, counts] = await Promise.all([
    db.productionBatch.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: { productionOrder: { select: { id: true, number: true, product: { select: { name: true, unit: true } } } } },
    }),
    db.productionBatch.count({ where }),
    db.productionBatch.groupBy({ by: ["status"], where: { productionOrder: scope }, _count: true }),
  ]);
  const count = (s: BatchStatus) => counts.find((c) => c.status === s)?._count ?? 0;

  return (
    <>
      <PageHeader title="Production batches" description="Batches move planned → in progress → QC. Passing QC consumes components and receives finished goods." />
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Planned" value={count("PLANNED")} />
        <StatCard label="In progress" value={count("IN_PROGRESS")} />
        <StatCard label="Awaiting QC" value={count("QC_PENDING")} tone={count("QC_PENDING") > 0 ? "warning" : "default"} />
        <StatCard label="Failed QC" value={count("FAILED") + count("PARTIALLY_PASSED")} hint="Failed or partially passed" />
      </div>
      <Card>
        <ListToolbar
          q={q}
          placeholder="Search batch, order or product"
          filter={{ name: "status", value: status, allLabel: "All statuses", options: Object.values(BatchStatus).map((s) => ({ value: s, label: humanize(s) })) }}
        />
        <Table>
          <THead>
            <tr>
              <TH>Batch</TH>
              <TH>Order</TH>
              <TH>Product</TH>
              <TH align="right">Qty</TH>
              <TH align="right">Passed</TH>
              <TH align="right">Failed</TH>
              <TH>Started</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {batches.length === 0 && <EmptyRow colSpan={8} />}
            {batches.map((b) => (
              <TR key={b.id}>
                <TD>
                  <Link href={`/manufacturing/batches/${b.id}`} className="font-medium text-brand-700 hover:underline">
                    {b.number}
                  </Link>
                </TD>
                <TD>
                  <Link href={`/manufacturing/orders/${b.productionOrder.id}`} className="hover:underline">
                    {b.productionOrder.number}
                  </Link>
                </TD>
                <TD>{b.productionOrder.product.name}</TD>
                <TD align="right">
                  {formatNumber(b.quantity)} <span className="text-xs text-ink-faint">{b.productionOrder.product.unit}</span>
                </TD>
                <TD align="right">{formatNumber(b.passedQty)}</TD>
                <TD align="right">{formatNumber(b.failedQty)}</TD>
                <TD className="text-ink-soft">{formatDateTime(b.startedAt)}</TD>
                <TD>
                  <MfgStatusBadge status={b.status} />
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
