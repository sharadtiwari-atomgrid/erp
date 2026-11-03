import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList, StatCard } from "@/components/ui/card";
import { Field, FormGrid, Input, Textarea } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime, formatMoney, formatNumber, num } from "@/lib/format";
import { can } from "@/lib/permissions";
import { ActionForm } from "../../_components/action-form";
import { ActivityCard } from "../../_components/activity-card";
import { MfgStatusBadge } from "../../_components/badges";
import { componentRequirement, round3 } from "../../_lib/bom-math";
import { availableByProduct } from "../../_lib/server";
import { deleteBatch, finishBatch, recordBatchQc, startBatch } from "../actions";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Production batch" };

export default async function BatchPage({ params }: PageProps<"/manufacturing/batches/[id]">) {
  const user = await requireUser("production");
  const { id } = await params;
  const batch = await db.productionBatch.findUnique({
    where: { id },
    include: {
      productionOrder: {
        include: {
          product: { select: { id: true, sku: true, name: true, unit: true } },
          warehouse: { select: { code: true, name: true } },
          bom: { include: { lines: { orderBy: { position: "asc" }, include: { component: { select: { id: true, sku: true, name: true, unit: true } } } } } },
        },
      },
    },
  });
  if (!batch) notFound();
  const order = batch.productionOrder;
  const qty = num(batch.quantity);
  const qcDone = batch.status === "PASSED" || batch.status === "PARTIALLY_PASSED" || batch.status === "FAILED";

  const [movements, available] = await Promise.all([
    db.stockMovement.findMany({
      where: { referenceType: "ProductionBatch", referenceId: id },
      orderBy: { createdAt: "asc" },
      include: { product: { select: { sku: true, name: true, unit: true } } },
    }),
    qcDone ? Promise.resolve(new Map<string, number>()) : availableByProduct(order.warehouseId, order.bom.lines.map((l) => l.componentId)),
  ]);
  const consumption = order.bom.lines.map((l) => ({
    line: l,
    qty: componentRequirement(num(l.quantity), num(l.scrapPct), num(order.bom.outputQty), qty),
  }));
  const canEdit = can(user, "production", "edit");
  const orderOpen = order.status === "DRAFT" || order.status === "SCHEDULED" || order.status === "IN_PROGRESS";

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {batch.number} <MfgStatusBadge status={batch.status} />
          </span>
        }
        description={`${order.product.name} · ${formatNumber(qty)} ${order.product.unit} on ${order.number}`}
        back={{ href: `/manufacturing/orders/${order.id}`, label: order.number }}
        actions={
          <>
            <ButtonLink href={`/manufacturing/batches/${id}/label`} variant="secondary">
              Print label
            </ButtonLink>
            {canEdit && batch.status === "PLANNED" && (
              <ActionButton action={deleteBatch.bind(null, id)} confirmMessage={`Delete ${batch.number}?`} pendingText="Deleting…">
                Delete
              </ActionButton>
            )}
            {canEdit && batch.status === "PLANNED" && orderOpen && (
              <ActionButton action={startBatch.bind(null, id)} variant="primary" pendingText="Starting…">
                Start batch
              </ActionButton>
            )}
            {canEdit && batch.status === "IN_PROGRESS" && (
              <ActionButton action={finishBatch.bind(null, id)} variant="primary" pendingText="Finishing…">
                Finish → QC
              </ActionButton>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Batch quantity" value={formatNumber(qty)} hint={order.product.unit} />
        <StatCard label="Passed" value={formatNumber(batch.passedQty)} />
        <StatCard label="Failed" value={formatNumber(batch.failedQty)} tone={num(batch.failedQty) > 0 ? "danger" : "default"} />
        <StatCard label="Order progress" value={`${formatNumber(order.producedQty)} / ${formatNumber(order.quantity)}`} hint={<MfgStatusBadge status={order.status} />} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DetailList
                items={[
                  {
                    label: "Production order",
                    value: (
                      <Link href={`/manufacturing/orders/${order.id}`} className="font-medium text-brand-700 hover:underline">
                        {order.number}
                      </Link>
                    ),
                  },
                  { label: "Product", value: `${order.product.sku} — ${order.product.name}` },
                  { label: "Warehouse", value: `${order.warehouse.code} — ${order.warehouse.name}` },
                  { label: "Planned", value: formatDateTime(batch.createdAt) },
                  { label: "Started", value: formatDateTime(batch.startedAt) },
                  { label: "Finished", value: formatDateTime(batch.completedAt) },
                  { label: "QC", value: formatDateTime(batch.qcAt) },
                  { label: "QC notes", value: batch.qcNotes },
                ]}
              />
            </CardBody>
          </Card>

          {canEdit && batch.status === "QC_PENDING" && (
            <Card>
              <CardHeader title="Quality check" description="Passed + failed must equal the batch quantity." />
              <CardBody>
                <ActionForm
                  action={recordBatchQc.bind(null, id)}
                  submitLabel="Record QC and post stock"
                  pendingText="Posting…"
                  confirmMessage="Record QC? Components will be consumed and passed units received into stock."
                >
                  <FormGrid>
                    <Field label="Passed qty" htmlFor="passedQty" required>
                      <Input id="passedQty" name="passedQty" type="number" min="0" max={qty} step="any" defaultValue={qty} required />
                    </Field>
                    <Field label="Failed qty" htmlFor="failedQty" required>
                      <Input id="failedQty" name="failedQty" type="number" min="0" max={qty} step="any" defaultValue={0} required />
                    </Field>
                  </FormGrid>
                  <Field label="Notes" htmlFor="qcNotes">
                    <Textarea id="qcNotes" name="qcNotes" rows={2} />
                  </Field>
                  <p className="text-xs text-ink-faint">
                    Result: all passed = Passed, none passed = Failed, otherwise Partially passed. Components are consumed for the full batch either way.
                  </p>
                </ActionForm>
              </CardBody>
            </Card>
          )}
        </div>

        <div className="space-y-6 lg:col-span-2">
          {!qcDone && (
            <Card>
              <CardHeader title="Components to consume at QC" description={`From ${order.warehouse.code}, BOM-proportional including scrap`} />
              <Table>
                <THead>
                  <tr>
                    <TH>Component</TH>
                    <TH align="right">To consume</TH>
                    <TH align="right">Available</TH>
                  </tr>
                </THead>
                <TBody>
                  {consumption.length === 0 && <EmptyRow colSpan={3}>No components.</EmptyRow>}
                  {consumption.map(({ line, qty: need }) => {
                    const avail = available.get(line.componentId) ?? 0;
                    return (
                      <TR key={line.id}>
                        <TD>
                          {line.component.name}
                          <div className="font-mono text-xs text-ink-faint">{line.component.sku}</div>
                        </TD>
                        <TD align="right">
                          {formatNumber(need)} <span className="text-xs text-ink-faint">{line.component.unit}</span>
                        </TD>
                        <TD align="right" className={avail < need ? "text-amber-700" : "text-ink-soft"} title="In hand minus reserved (this order's own reservation counts as reserved)">
                          {formatNumber(round3(avail))}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </Card>
          )}

          <Card>
            <CardHeader title="Stock posted" description="Movements created when QC was recorded" />
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Item</TH>
                  <TH>Type</TH>
                  <TH align="right">Qty</TH>
                  <TH align="right">Unit cost</TH>
                </tr>
              </THead>
              <TBody>
                {movements.length === 0 && <EmptyRow colSpan={5}>Nothing posted yet.</EmptyRow>}
                {movements.map((m) => (
                  <TR key={m.id}>
                    <TD className="whitespace-nowrap text-ink-soft">{formatDateTime(m.createdAt)}</TD>
                    <TD>
                      {m.product.name}
                      <div className="font-mono text-xs text-ink-faint">{m.product.sku}</div>
                    </TD>
                    <TD className="text-xs">{m.type === "PRODUCTION_IN" ? "Produced" : "Consumed"}</TD>
                    <TD align="right" className={num(m.quantity) < 0 ? "text-red-700" : "text-emerald-700"}>
                      {formatNumber(m.quantity)} <span className="text-xs text-ink-faint">{m.product.unit}</span>
                    </TD>
                    <TD align="right">{m.unitCost === null ? "—" : formatMoney(m.unitCost)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>

          <ActivityCard entityType="ProductionBatch" entityId={id} />
        </div>
      </div>
    </>
  );
}
