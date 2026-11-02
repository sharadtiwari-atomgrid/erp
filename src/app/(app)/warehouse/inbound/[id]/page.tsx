import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList, StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatDateTime, formatMoney, formatNumber, num } from "@/lib/format";
import { can } from "@/lib/permissions";
import { ActivityCard } from "../../../sales/_components/activity-card";
import { QrCode } from "../../_components/qr-code";
import { WarehouseStatusBadge } from "../../_components/status";
import { absoluteUrl } from "../../_lib/qr";
import { cancelInbound, completeQc } from "../actions";
import { QcForm } from "./qc-form";

export const metadata: Metadata = { title: "GRN" };

export default async function InboundReceiptPage({ params }: PageProps<"/warehouse/inbound/[id]">) {
  const user = await requireUser("inbound");
  const { id } = await params;
  const receipt = await db.inboundReceipt.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, name: true, gstin: true } },
      purchaseOrder: { select: { id: true, number: true, status: true } },
      warehouse: { select: { id: true, code: true, name: true } },
      branch: { select: { name: true } },
      lines: {
        orderBy: { product: { name: "asc" } },
        include: {
          product: { select: { id: true, sku: true, name: true, unit: true, qcRequired: true } },
          bin: { select: { code: true } },
        },
      },
    },
  });
  if (!receipt) notFound();

  const canEdit = can(user, "inbound", "edit");
  const pending = receipt.status === "QC_PENDING";
  const received = receipt.lines.reduce((s, l) => s + num(l.receivedQty), 0);
  const accepted = receipt.lines.reduce((s, l) => s + num(l.acceptedQty), 0);
  const rejected = receipt.lines.reduce((s, l) => s + num(l.rejectedQty), 0);
  const value = receipt.lines.reduce((s, l) => s + num(l.receivedQty) * num(l.unitCost), 0);
  const qcPassed = receipt.status === "COMPLETED" && accepted > 0;
  const bins = pending
    ? await db.bin.findMany({ where: { warehouseId: receipt.warehouseId, isActive: true }, orderBy: { code: "asc" }, select: { id: true, code: true, zone: true } })
    : [];

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {receipt.number} <WarehouseStatusBadge status={receipt.status} />
          </span>
        }
        description={`${receipt.supplier?.name ?? "No supplier"} · received ${formatDate(receipt.receivedAt)} into ${receipt.warehouse.code}`}
        back={{ href: "/warehouse/inbound", label: "Inbound" }}
        actions={
          <>
            {canEdit && pending && (
              <ActionButton
                action={cancelInbound.bind(null, id)}
                variant="ghost"
                confirmMessage={`Cancel ${receipt.number}?${receipt.purchaseOrder ? " Received quantities go back to the purchase order." : ""}`}
                pendingText="Cancelling…"
              >
                Cancel GRN
              </ActionButton>
            )}
            <ButtonLink href={`/warehouse/inbound/${id}/print`} variant={qcPassed ? "primary" : "secondary"}>
              {qcPassed ? "Print GRN & QR label" : "Print GRN"}
            </ButtonLink>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Received" value={formatNumber(received)} hint={`${receipt.lines.length} line${receipt.lines.length === 1 ? "" : "s"}`} />
        <StatCard label="Accepted" value={pending ? "—" : formatNumber(accepted)} hint={pending ? "Awaiting QC" : "Posted to stock"} />
        <StatCard label="Rejected" value={pending ? "—" : formatNumber(rejected)} tone={rejected > 0 ? "warning" : "default"} />
        <StatCard label="Value received" value={formatMoney(value)} hint="At unit cost, before GST" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {pending && canEdit ? (
            <Card>
              <CardHeader title="Quality check" description="Enter accepted and rejected quantity for each line. Items that need no QC are pre-filled as fully accepted." />
              <QcForm
                action={completeQc.bind(null, id)}
                bins={bins}
                lines={receipt.lines.map((l) => ({
                  id: l.id,
                  sku: l.product.sku,
                  name: l.product.name,
                  unit: l.product.unit,
                  qcRequired: l.product.qcRequired,
                  received: num(l.receivedQty),
                  unitCost: num(l.unitCost),
                  accepted: l.product.qcRequired ? null : num(l.acceptedQty),
                }))}
              />
            </Card>
          ) : (
            <Card>
              <CardHeader title="Lines" />
              <Table>
                <THead>
                  <tr>
                    <TH>Product</TH>
                    <TH align="right">Received</TH>
                    <TH align="right">Accepted</TH>
                    <TH align="right">Rejected</TH>
                    <TH align="right">Unit cost</TH>
                    <TH>QC</TH>
                    <TH>Bin</TH>
                  </tr>
                </THead>
                <TBody>
                  {receipt.lines.length === 0 && <EmptyRow colSpan={7}>No lines.</EmptyRow>}
                  {receipt.lines.map((l) => (
                    <TR key={l.id}>
                      <TD>
                        <Link href={`/inventory/products/${l.product.id}`} className="font-medium text-brand-700 hover:underline">
                          {l.product.name}
                        </Link>
                        <div className="font-mono text-xs text-ink-faint">{l.product.sku}</div>
                        {l.qcNotes && <div className="text-xs text-ink-soft">{l.qcNotes}</div>}
                      </TD>
                      <TD align="right">
                        {formatNumber(l.receivedQty)} <span className="text-xs text-ink-faint">{l.product.unit}</span>
                      </TD>
                      <TD align="right">{pending ? "—" : formatNumber(l.acceptedQty)}</TD>
                      <TD align="right" className={num(l.rejectedQty) > 0 ? "text-red-600" : undefined}>
                        {pending ? "—" : formatNumber(l.rejectedQty)}
                      </TD>
                      <TD align="right">{formatMoney(l.unitCost)}</TD>
                      <TD>
                        <WarehouseStatusBadge status={l.qcResult} />
                      </TD>
                      <TD className="font-mono text-xs">{l.bin?.code ?? "—"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DetailList
                items={[
                  {
                    label: "Supplier",
                    value: receipt.supplier ? (
                      <Link href={`/contacts/${receipt.supplier.id}`} className="text-brand-700 hover:underline">
                        {receipt.supplier.name}
                      </Link>
                    ) : null,
                  },
                  {
                    label: "Purchase order",
                    value: receipt.purchaseOrder ? (
                      <Link href={`/purchasing/orders/${receipt.purchaseOrder.id}`} className="text-brand-700 hover:underline">
                        {receipt.purchaseOrder.number}
                      </Link>
                    ) : (
                      "Standalone receipt"
                    ),
                  },
                  {
                    label: "Warehouse",
                    value: (
                      <Link href={`/inventory/warehouses/${receipt.warehouse.id}`} className="text-brand-700 hover:underline">
                        {receipt.warehouse.code} — {receipt.warehouse.name}
                      </Link>
                    ),
                  },
                  { label: "Branch", value: receipt.branch.name },
                  { label: "Supplier invoice", value: receipt.supplierInvoice },
                  { label: "Vehicle no.", value: receipt.vehicleNo },
                  { label: "Received", value: formatDateTime(receipt.receivedAt) },
                  { label: "QC completed", value: receipt.qcCompletedAt ? formatDateTime(receipt.qcCompletedAt) : null },
                  { label: "Notes", value: receipt.notes },
                ]}
              />
            </CardBody>
          </Card>
          {qcPassed && (
            <Card>
              <CardHeader title="GRN label" description="Scan to open this GRN." />
              <CardBody className="flex items-center gap-4">
                <QrCode value={await absoluteUrl(`/warehouse/inbound/${id}`)} size={112} label={`QR code for ${receipt.number}`} />
                <Link href={`/warehouse/inbound/${id}/print`} className="text-sm font-medium text-brand-700 hover:underline">
                  Print label
                </Link>
              </CardBody>
            </Card>
          )}
          <ActivityCard entityType="InboundReceipt" entityId={id} />
        </div>
      </div>
    </>
  );
}
