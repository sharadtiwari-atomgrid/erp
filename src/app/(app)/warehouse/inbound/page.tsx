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
import { InboundStatus } from "@/generated/prisma/enums";
import { WarehouseStatusBadge } from "../_components/status";

export const metadata: Metadata = { title: "Inbound" };

export default async function InboundPage({ searchParams }: PageProps<"/warehouse/inbound">) {
  const user = await requireUser("inbound");
  const sp = await searchParams;
  const q = param(sp, "q");
  const status = param(sp, "status");
  const warehouseId = param(sp, "warehouse");
  const { page, take, skip } = pagination(sp);
  const scope = await branchWhere();

  const where: Prisma.InboundReceiptWhereInput = {
    ...scope,
    ...(q && {
      OR: [
        { number: { contains: q, mode: "insensitive" } },
        { supplierInvoice: { contains: q, mode: "insensitive" } },
        { vehicleNo: { contains: q, mode: "insensitive" } },
        { supplier: { name: { contains: q, mode: "insensitive" } } },
        { purchaseOrder: { number: { contains: q, mode: "insensitive" } } },
      ],
    }),
    ...(Object.hasOwn(InboundStatus, status) && { status: status as InboundStatus }),
    ...(warehouseId && { warehouseId }),
  };

  const [receipts, total, warehouses, pendingQc] = await Promise.all([
    db.inboundReceipt.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: {
        supplier: { select: { name: true } },
        purchaseOrder: { select: { id: true, number: true } },
        warehouse: { select: { code: true } },
        lines: { select: { receivedQty: true, acceptedQty: true, rejectedQty: true } },
      },
    }),
    db.inboundReceipt.count({ where }),
    db.warehouse.findMany({ where: scope, orderBy: { name: "asc" }, select: { id: true, code: true, name: true } }),
    db.inboundReceipt.count({ where: { ...scope, status: "QC_PENDING" } }),
  ]);

  return (
    <>
      <PageHeader
        title="Inbound"
        description={`Goods receipt notes (GRN) and quality checks. ${pendingQc} awaiting QC.`}
        actions={can(user, "inbound", "edit") && <ButtonLink href="/warehouse/inbound/new">New GRN</ButtonLink>}
      />
      <Card>
        <ListToolbar
          q={q}
          placeholder="Search GRN, PO, supplier, invoice, vehicle"
          filter={{
            name: "status",
            value: status,
            allLabel: "All statuses",
            options: Object.values(InboundStatus).map((s) => ({ value: s, label: humanize(s) })),
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
              <TH>GRN</TH>
              <TH>Received</TH>
              <TH>Supplier</TH>
              <TH>PO</TH>
              <TH>Warehouse</TH>
              <TH>Invoice / vehicle</TH>
              <TH align="right">Received qty</TH>
              <TH align="right">Accepted</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {receipts.length === 0 && <EmptyRow colSpan={9} />}
            {receipts.map((r) => {
              const received = r.lines.reduce((s, l) => s + num(l.receivedQty), 0);
              const accepted = r.lines.reduce((s, l) => s + num(l.acceptedQty), 0);
              return (
                <TR key={r.id}>
                  <TD>
                    <Link href={`/warehouse/inbound/${r.id}`} className="font-medium text-brand-700 hover:underline">
                      {r.number}
                    </Link>
                  </TD>
                  <TD className="whitespace-nowrap text-ink-soft">{formatDate(r.receivedAt)}</TD>
                  <TD>{r.supplier?.name ?? "—"}</TD>
                  <TD>
                    {r.purchaseOrder ? (
                      <Link href={`/purchasing/orders/${r.purchaseOrder.id}`} className="text-brand-700 hover:underline">
                        {r.purchaseOrder.number}
                      </Link>
                    ) : (
                      <span className="text-ink-faint">Standalone</span>
                    )}
                  </TD>
                  <TD className="font-mono text-xs">{r.warehouse.code}</TD>
                  <TD className="text-xs text-ink-soft">
                    {r.supplierInvoice ?? "—"}
                    {r.vehicleNo && <div className="font-mono">{r.vehicleNo}</div>}
                  </TD>
                  <TD align="right">{formatNumber(received)}</TD>
                  <TD align="right">{r.status === "COMPLETED" ? formatNumber(accepted) : <span className="text-ink-faint">—</span>}</TD>
                  <TD>
                    <WarehouseStatusBadge status={r.status} />
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
