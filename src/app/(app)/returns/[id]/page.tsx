import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList, StatCard } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatDateTime, formatMoney, formatNumber, num } from "@/lib/format";
import { can } from "@/lib/permissions";
import { OpsBadge } from "../../logistics/_components/badges";
import { ActivityCard } from "../../sales/_components/activity-card";
import { closeBlocker, pendingRepairs, suggestedCredit } from "../_lib/returns";
import { loadReturnSource } from "../_lib/source";
import { cancelReturn, closeReturn, inspectReturn, markRepaired, receiveReturn, saveCredit } from "../actions";
import { InspectForm, ReceiveForm } from "./line-forms";

export const metadata: Metadata = { title: "Return" };

export default async function ReturnPage({ params }: PageProps<"/returns/[id]">) {
  const user = await requireUser("returns");
  const { id } = await params;
  const ret = await db.returnOrder.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      invoice: { select: { id: true, number: true } },
      salesOrder: { select: { id: true, number: true } },
      warehouse: { select: { id: true, name: true } },
      branch: { select: { name: true } },
      lines: { orderBy: { id: "asc" }, include: { product: { select: { id: true, sku: true, name: true, unit: true } } } },
    },
  });
  if (!ret) notFound();

  const source = await loadReturnSource({ invoiceId: ret.invoiceId, salesOrderId: ret.invoiceId ? null : ret.salesOrderId });
  const prices = new Map(source?.lines.map((l) => [l.productId, l.unitPrice]) ?? []);
  const received = ret.status !== "REQUESTED" && ret.status !== "CANCELLED";
  const suggestion = suggestedCredit(ret.lines, prices, received);
  const credit = num(ret.creditAmount);
  const creditDefault = credit > 0 ? credit : suggestion;

  const canEdit = can(user, "returns", "edit");
  const open = ret.status === "REQUESTED" || ret.status === "RECEIVED" || ret.status === "INSPECTED";
  const repairs = pendingRepairs(ret.lines);
  const blocker = closeBlocker(ret.status, ret.lines);
  const rows = ret.lines.map((l) => ({
    id: l.id,
    sku: l.product.sku,
    name: l.product.name,
    unit: l.product.unit,
    quantity: num(l.quantity),
    receivedQty: num(l.receivedQty),
  }));
  const totals = ret.lines.reduce(
    (s, l) => ({ requested: s.requested + num(l.quantity), received: s.received + num(l.receivedQty), restocked: s.restocked + num(l.restockedQty), scrapped: s.scrapped + num(l.scrappedQty) }),
    { requested: 0, received: 0, restocked: 0, scrapped: 0 },
  );

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {ret.number} <OpsBadge status={ret.status} />
            {repairs > 0 && <OpsBadge status="REPAIR" label={`${repairs} in repair`} />}
          </span>
        }
        description={ret.customer.name}
        back={{ href: "/returns", label: "Returns" }}
        actions={
          <>
            {canEdit && ret.status === "REQUESTED" && (
              <ActionButton action={cancelReturn.bind(null, id)} variant="ghost" confirmMessage="Cancel this return?">
                Cancel return
              </ActionButton>
            )}
            <ButtonLink href={`/returns/${id}/print`} variant="secondary">
              Print
            </ButtonLink>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Requested" value={formatNumber(totals.requested)} hint={`${ret.lines.length} line${ret.lines.length === 1 ? "" : "s"}`} />
        <StatCard label="Received" value={received ? formatNumber(totals.received) : "—"} hint={ret.receivedAt ? formatDate(ret.receivedAt) : undefined} />
        <StatCard
          label="Restocked / scrapped"
          value={ret.inspectedAt ? `${formatNumber(totals.restocked)} / ${formatNumber(totals.scrapped)}` : "—"}
          hint={repairs > 0 ? `${repairs} line${repairs === 1 ? "" : "s"} awaiting repair` : undefined}
          tone={repairs > 0 ? "warning" : "default"}
        />
        <StatCard label="Credit" value={formatMoney(credit)} hint={suggestion > 0 ? `Suggested ${formatMoney(suggestion)}` : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {canEdit && ret.status === "REQUESTED" ? (
            <ReceiveForm action={receiveReturn.bind(null, id)} rows={rows} warehouseName={ret.warehouse.name} />
          ) : canEdit && ret.status === "RECEIVED" ? (
            <InspectForm action={inspectReturn.bind(null, id)} rows={rows} />
          ) : (
            <Card>
              <CardHeader title="Lines" />
              <Table>
                <THead>
                  <tr>
                    <TH>Product</TH>
                    <TH align="right">Requested</TH>
                    <TH align="right">Received</TH>
                    <TH>Disposition</TH>
                    <TH align="right">Restocked</TH>
                    <TH align="right">Scrapped</TH>
                    <TH>QC notes</TH>
                  </tr>
                </THead>
                <TBody>
                  {ret.lines.length === 0 && <EmptyRow colSpan={7}>No lines.</EmptyRow>}
                  {ret.lines.map((l) => {
                    const awaitingRepair = l.disposition === "REPAIR" && !l.repairedAt;
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
                        <TD align="right">{received ? formatNumber(l.receivedQty) : "—"}</TD>
                        <TD>
                          <div className="flex flex-col items-start gap-1">
                            <OpsBadge status={l.repairedAt ? "REPAIRED" : l.disposition} />
                            {l.repairedAt && <span className="text-xs text-ink-faint">{formatDate(l.repairedAt)}</span>}
                            {canEdit && awaitingRepair && ret.status === "INSPECTED" && (
                              <ActionButton
                                action={markRepaired.bind(null, id, l.id)}
                                size="sm"
                                pendingText="Saving…"
                                confirmMessage={`Mark ${l.product.name} repaired and restock ${formatNumber(l.receivedQty)} ${l.product.unit}?`}
                              >
                                Mark repaired
                              </ActionButton>
                            )}
                          </div>
                        </TD>
                        <TD align="right">{num(l.restockedQty) > 0 ? formatNumber(l.restockedQty) : "—"}</TD>
                        <TD align="right">{num(l.scrappedQty) > 0 ? formatNumber(l.scrappedQty) : "—"}</TD>
                        <TD className="text-xs text-ink-soft">{l.qcNotes ?? "—"}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </Card>
          )}
        </div>

        <div className="space-y-6 lg:col-span-1">
          {canEdit && open && (
            <Card>
              <CardHeader
                title={ret.status === "INSPECTED" ? "Credit & close" : "Credit"}
                description={
                  prices.size > 0
                    ? `Suggested: ${received ? "received" : "requested"} quantity × price paid incl. GST on ${source?.number}.`
                    : "No source invoice or order: enter the credit manually."
                }
              />
              <CardBody className="space-y-3">
                <ActionButton
                  action={saveCredit.bind(null, id)}
                  size="sm"
                  pendingText="Saving…"
                  fields={<Input name="creditAmount" type="number" min="0" step="0.01" defaultValue={creditDefault} className="h-8 w-36 text-right text-xs" aria-label="Credit amount" />}
                >
                  Save credit
                </ActionButton>
                {ret.status === "INSPECTED" && (
                  <div className="border-t border-line pt-3">
                    {blocker ? (
                      <p className="text-xs text-amber-700">{blocker}</p>
                    ) : (
                      <ActionButton
                        action={closeReturn.bind(null, id)}
                        variant="primary"
                        pendingText="Closing…"
                        confirmMessage="Close this return? The credit amount can't be changed afterwards."
                        fields={<Input name="creditAmount" type="number" min="0" step="0.01" defaultValue={creditDefault} className="w-36 text-right" aria-label="Final credit amount" />}
                      >
                        Close return
                      </ActionButton>
                    )}
                  </div>
                )}
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DetailList
                items={[
                  {
                    label: "Customer",
                    value: (
                      <Link href={`/contacts/${ret.customer.id}`} className="text-brand-700 hover:underline">
                        {ret.customer.name}
                      </Link>
                    ),
                  },
                  {
                    label: "Invoice",
                    value: ret.invoice && (
                      <Link href={`/sales/invoices/${ret.invoice.id}`} className="text-brand-700 hover:underline">
                        {ret.invoice.number}
                      </Link>
                    ),
                  },
                  {
                    label: "Sales order",
                    value: ret.salesOrder && (
                      <Link href={`/sales/orders/${ret.salesOrder.id}`} className="text-brand-700 hover:underline">
                        {ret.salesOrder.number}
                      </Link>
                    ),
                  },
                  { label: "Receiving warehouse", value: `${ret.warehouse.name} (${ret.branch.name})` },
                  { label: "Reason", value: ret.reason },
                  { label: "Requested", value: formatDateTime(ret.requestedAt) },
                  { label: "Received", value: formatDateTime(ret.receivedAt) },
                  { label: "Inspected", value: formatDateTime(ret.inspectedAt) },
                  { label: "Closed", value: formatDateTime(ret.closedAt) },
                  { label: "Notes", value: ret.notes },
                ]}
              />
            </CardBody>
          </Card>
          <ActivityCard entityType="ReturnOrder" entityId={id} />
        </div>
      </div>
    </>
  );
}
