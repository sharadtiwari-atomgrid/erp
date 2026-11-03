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
import { formatDate, formatDateTime, formatMoney, formatNumber, humanize, num } from "@/lib/format";
import { can } from "@/lib/permissions";
import { ActivityCard } from "../../../sales/_components/activity-card";
import { PickForm } from "../../_components/pick-form";
import { OutboundSteps, WarehouseStatusBadge } from "../../_components/status";
import { loadPickSheet } from "../../_lib/pick-sheet";
import {
  addHandlingUnit,
  cancelOutbound,
  completePacking,
  deleteHandlingUnit,
  dispatchOutbound,
  savePicks,
  startPacking,
} from "../actions";
import { HandlingUnitForm } from "./hu-form";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Outbound order" };

export default async function OutboundOrderPage({ params, searchParams }: PageProps<"/warehouse/outbound/[id]">) {
  const user = await requireUser("outbound");
  const { id } = await params;
  const sp = await searchParams;
  const highlight = typeof sp.hu === "string" ? sp.hu : null;
  const outbound = await db.outboundOrder.findUnique({
    where: { id },
    include: {
      salesOrder: { select: { id: true, number: true, customer: { select: { id: true, name: true } } } },
      warehouse: { select: { id: true, code: true, name: true } },
      pickingSession: { select: { id: true, number: true, status: true, assignedTo: { select: { name: true } } } },
      packingSessions: { orderBy: { startedAt: "desc" }, include: { packedBy: { select: { name: true } } } },
      trip: { select: { id: true, number: true, status: true } },
      shippingDocs: { orderBy: { issuedAt: "desc" }, select: { id: true, number: true, type: true, issuedAt: true, deliveredAt: true } },
      invoices: { orderBy: { createdAt: "desc" }, select: { id: true, number: true, status: true, total: true } },
      lines: {
        orderBy: { product: { name: "asc" } },
        include: { product: { select: { id: true, sku: true, name: true, unit: true } }, bin: { select: { code: true } } },
      },
      handlingUnits: {
        orderBy: { code: "asc" },
        include: { items: { include: { product: { select: { sku: true, name: true, unit: true } } } } },
      },
    },
  });
  if (!outbound) notFound();

  const canEdit = can(user, "outbound", "edit");
  const { status } = outbound;
  const inOpenSession = outbound.pickingSession?.status === "OPEN";
  const canPick = canEdit && (status === "PENDING" || status === "PICKING") && !inOpenSession;
  const canCancel = canEdit && status !== "DISPATCHED" && status !== "CANCELLED";
  const pickSheet = canPick ? await loadPickSheet([id], outbound.warehouseId) : null;
  const packing = status === "PACKING";
  const allPacked = outbound.lines.every((l) => Math.abs(num(l.packedQty) - num(l.pickedQty)) < 0.0005);
  const showPrint = outbound.handlingUnits.length > 0;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {outbound.number} <WarehouseStatusBadge status={status} />
          </span>
        }
        description={`${outbound.salesOrder.customer.name} · ${outbound.salesOrder.number} · ${outbound.warehouse.code}`}
        back={{ href: "/warehouse/outbound", label: "Outbound" }}
        actions={
          <>
            {canCancel && (
              <ActionButton
                action={cancelOutbound.bind(null, id)}
                variant="ghost"
                confirmMessage={`Cancel ${outbound.number}? Picked stock is released back to the sales order.`}
                pendingText="Cancelling…"
              >
                Cancel
              </ActionButton>
            )}
            {showPrint && (
              <>
                <ButtonLink href={`/warehouse/outbound/${id}/labels`} variant="secondary">
                  HU labels
                </ButtonLink>
                <ButtonLink href={`/warehouse/outbound/${id}/print`} variant="secondary">
                  Packing list
                </ButtonLink>
              </>
            )}
            {canEdit && status === "PICKED" && (
              <ActionButton action={startPacking.bind(null, id)} variant="primary" pendingText="Starting…">
                Start packing
              </ActionButton>
            )}
            {canEdit && packing && (
              <ActionButton
                action={completePacking.bind(null, id)}
                variant="primary"
                pendingText="Completing…"
                disabled={!allPacked || outbound.handlingUnits.length === 0}
                title={allPacked ? undefined : "Pack every picked unit first"}
              >
                Complete packing
              </ActionButton>
            )}
            {canEdit && status === "PACKED" && (
              <ActionButton
                action={dispatchOutbound.bind(null, id)}
                variant="primary"
                pendingText="Dispatching…"
                confirmMessage={`Dispatch ${outbound.number}? Stock leaves ${outbound.warehouse.code}.`}
              >
                Dispatch
              </ActionButton>
            )}
          </>
        }
      />

      <div className="mb-6">
        <OutboundSteps status={status} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {pickSheet ? (
            <Card>
              <CardHeader title="Pick" description="Record what was picked, and optionally the bin it came from. Picked stock is allocated to this order." />
              <PickForm
                action={savePicks.bind(null, id)}
                groups={pickSheet.groups}
                bins={pickSheet.bins}
                binStock={pickSheet.binStock}
                completeLabel="Complete picking"
              />
            </Card>
          ) : (
            <Card>
              <CardHeader
                title="Lines"
                description={
                  inOpenSession && outbound.pickingSession ? (
                    <>
                      Being picked in{" "}
                      <Link href={`/warehouse/picking/${outbound.pickingSession.id}`} className="text-brand-700 hover:underline">
                        {outbound.pickingSession.number}
                      </Link>
                    </>
                  ) : undefined
                }
              />
              <Table>
                <THead>
                  <tr>
                    <TH>Product</TH>
                    <TH align="right">Ordered</TH>
                    <TH align="right">Picked</TH>
                    <TH align="right">Packed</TH>
                    <TH>Bin</TH>
                  </tr>
                </THead>
                <TBody>
                  {outbound.lines.length === 0 && <EmptyRow colSpan={5}>No lines.</EmptyRow>}
                  {outbound.lines.map((l) => {
                    const short = num(l.pickedQty) < num(l.quantity) && status !== "PENDING" && status !== "PICKING";
                    return (
                      <TR key={l.id}>
                        <TD>
                          <Link href={`/inventory/products/${l.product.id}`} className="font-medium text-brand-700 hover:underline">
                            {l.product.name}
                          </Link>
                          <div className="font-mono text-xs text-ink-faint">{l.product.sku}</div>
                        </TD>
                        <TD align="right">
                          {formatNumber(l.quantity)} <span className="text-xs text-ink-faint">{l.product.unit}</span>
                        </TD>
                        <TD align="right" className={short ? "text-amber-700" : undefined}>
                          {formatNumber(l.pickedQty)}
                          {short && <div className="text-xs">short {formatNumber(num(l.quantity) - num(l.pickedQty))}</div>}
                        </TD>
                        <TD align="right">{formatNumber(l.packedQty)}</TD>
                        <TD className="font-mono text-xs">{l.bin?.code ?? "—"}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </Card>
          )}

          {packing && canEdit && (
            <Card>
              <CardHeader title="Add handling unit" description="Box, carton or pallet with the quantity of each item it holds. Packed must equal picked on every line." />
              <HandlingUnitForm
                action={addHandlingUnit.bind(null, id)}
                lines={outbound.lines.map((l) => ({
                  id: l.id,
                  sku: l.product.sku,
                  name: l.product.name,
                  unit: l.product.unit,
                  picked: num(l.pickedQty),
                  packed: num(l.packedQty),
                }))}
              />
            </Card>
          )}

          {(outbound.handlingUnits.length > 0 || packing) && (
            <Card>
              <CardHeader title="Handling units" description={`${outbound.handlingUnits.length} packed`} />
              <ul className="divide-y divide-line">
                {outbound.handlingUnits.length === 0 && <li className="px-5 py-8 text-center text-sm text-ink-faint">No handling units yet.</li>}
                {outbound.handlingUnits.map((hu) => (
                  <li key={hu.id} id={hu.code} className={highlight === hu.code ? "bg-amber-50 px-5 py-3" : "px-5 py-3"}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-sm font-semibold">{hu.code}</p>
                        <p className="text-xs text-ink-soft">
                          {humanize(hu.type)}
                          {hu.weightKg !== null && ` · ${formatNumber(hu.weightKg)} kg`}
                          {hu.dimensions && ` · ${hu.dimensions}`}
                        </p>
                        <ul className="mt-1 text-sm">
                          {hu.items.map((item) => (
                            <li key={item.id}>
                              {formatNumber(item.quantity)} {item.product.unit} × {item.product.name}{" "}
                              <span className="font-mono text-xs text-ink-faint">{item.product.sku}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      {packing && canEdit && (
                        <ActionButton action={deleteHandlingUnit.bind(null, id, hu.id)} variant="ghost" size="sm" confirmMessage={`Remove ${hu.code}?`}>
                          Remove
                        </ActionButton>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
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
                    label: "Sales order",
                    value: (
                      <Link href={`/sales/orders/${outbound.salesOrder.id}`} className="text-brand-700 hover:underline">
                        {outbound.salesOrder.number}
                      </Link>
                    ),
                  },
                  {
                    label: "Customer",
                    value: (
                      <Link href={`/contacts/${outbound.salesOrder.customer.id}`} className="text-brand-700 hover:underline">
                        {outbound.salesOrder.customer.name}
                      </Link>
                    ),
                  },
                  {
                    label: "Warehouse",
                    value: (
                      <Link href={`/inventory/warehouses/${outbound.warehouse.id}`} className="text-brand-700 hover:underline">
                        {outbound.warehouse.code} — {outbound.warehouse.name}
                      </Link>
                    ),
                  },
                  {
                    label: "Picking session",
                    value: outbound.pickingSession ? (
                      <Link href={`/warehouse/picking/${outbound.pickingSession.id}`} className="text-brand-700 hover:underline">
                        {outbound.pickingSession.number}
                        {outbound.pickingSession.assignedTo && ` · ${outbound.pickingSession.assignedTo.name}`}
                      </Link>
                    ) : null,
                  },
                  {
                    label: "Packing",
                    value: outbound.packingSessions.length
                      ? outbound.packingSessions.map((p) => `${p.number} (${humanize(p.status).toLowerCase()}${p.packedBy ? `, ${p.packedBy.name}` : ""})`).join("\n")
                      : null,
                  },
                  { label: "Created", value: formatDateTime(outbound.createdAt) },
                  { label: "Picked", value: outbound.pickedAt ? formatDateTime(outbound.pickedAt) : null },
                  { label: "Packed", value: outbound.packedAt ? formatDateTime(outbound.packedAt) : null },
                  { label: "Dispatched", value: outbound.dispatchedAt ? formatDateTime(outbound.dispatchedAt) : null },
                  { label: "Notes", value: outbound.notes },
                ]}
              />
            </CardBody>
          </Card>

          {(outbound.trip || outbound.shippingDocs.length > 0 || outbound.invoices.length > 0) && (
            <Card>
              <CardHeader title="Shipping & billing" description="Linked by Logistics and Books" />
              <CardBody className="space-y-3 text-sm">
                {outbound.trip && (
                  <p className="flex items-center justify-between gap-2">
                    <span>
                      Trip{" "}
                      <Link href={`/logistics/trips/${outbound.trip.id}`} className="font-medium text-brand-700 hover:underline">
                        {outbound.trip.number}
                      </Link>
                    </span>
                    <StatusBadge status={outbound.trip.status} />
                  </p>
                )}
                {outbound.shippingDocs.map((d) => (
                  <p key={d.id} className="flex items-center justify-between gap-2">
                    <span>
                      {d.type} <span className="font-mono">{d.number}</span>
                    </span>
                    <span className="text-xs text-ink-soft">{d.deliveredAt ? `Delivered ${formatDate(d.deliveredAt)}` : formatDate(d.issuedAt)}</span>
                  </p>
                ))}
                {outbound.invoices.map((inv) => (
                  <p key={inv.id} className="flex items-center justify-between gap-2">
                    <Link href={`/sales/invoices/${inv.id}`} className="font-medium text-brand-700 hover:underline">
                      {inv.number}
                    </Link>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums">{formatMoney(inv.total)}</span>
                      <StatusBadge status={inv.status} />
                    </span>
                  </p>
                ))}
              </CardBody>
            </Card>
          )}
          <ActivityCard entityType="OutboundOrder" entityId={id} />
        </div>
      </div>
    </>
  );
}
