import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { formatDate, formatDateTime, formatNumber, humanize, num } from "@/lib/format";
import { can } from "@/lib/permissions";
import { toIstDateTimeInput } from "../../../books/_lib/eway";
import { ActivityCard } from "../../../sales/_components/activity-card";
import { OpsBadge } from "../../_components/badges";
import { markDelivered } from "../actions";
import { DeliveredForm } from "../document-forms";
import { loadShippingDocument } from "../load";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Shipping document" };

export default async function ShippingDocumentPage({ params }: PageProps<"/logistics/documents/[id]">) {
  const user = await requireUser("trips");
  const { id } = await params;
  const doc = await loadShippingDocument(id);
  if (!doc) notFound();

  const canDeliver = can(user, "trips", "edit") && doc.type === "DN" && !doc.deliveredAt;
  const outbound = doc.outbound;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {doc.number} <OpsBadge status={doc.type} />
            {doc.deliveredAt && <OpsBadge status="DELIVERED" />}
          </span>
        }
        description={doc.customer?.name}
        back={{ href: "/logistics/documents", label: "ASN & delivery notes" }}
        actions={<ButtonLink href={`/logistics/documents/${id}/print`}>Print</ButtonLink>}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Items" description={outbound ? `From outbound ${outbound.number}` : undefined} />
            <Table>
              <THead>
                <tr>
                  <TH>Product</TH>
                  <TH>HSN</TH>
                  <TH align="right">Ordered</TH>
                  <TH align="right">Packed</TH>
                </tr>
              </THead>
              <TBody>
                {(!outbound || outbound.lines.length === 0) && <EmptyRow colSpan={4}>No items.</EmptyRow>}
                {outbound?.lines.map((l) => (
                  <TR key={l.id}>
                    <TD>
                      <div className="font-medium">{l.product.name}</div>
                      <div className="font-mono text-xs text-ink-faint">{l.product.sku}</div>
                    </TD>
                    <TD className="font-mono text-xs">{l.product.hsnCode ?? "—"}</TD>
                    <TD align="right">
                      {formatNumber(l.quantity)} <span className="text-xs text-ink-faint">{l.product.unit}</span>
                    </TD>
                    <TD align="right">{formatNumber(num(l.packedQty) > 0 ? l.packedQty : l.quantity)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>

          <Card>
            <CardHeader title="Handling units" description={outbound ? `${outbound.handlingUnits.length} package${outbound.handlingUnits.length === 1 ? "" : "s"}` : undefined} />
            <Table>
              <THead>
                <tr>
                  <TH>Code</TH>
                  <TH>Type</TH>
                  <TH align="right">Weight</TH>
                  <TH>Dimensions</TH>
                  <TH>Contents</TH>
                </tr>
              </THead>
              <TBody>
                {(!outbound || outbound.handlingUnits.length === 0) && <EmptyRow colSpan={5}>No handling units recorded.</EmptyRow>}
                {outbound?.handlingUnits.map((hu) => (
                  <TR key={hu.id}>
                    <TD className="font-mono text-xs">{hu.code}</TD>
                    <TD>{humanize(hu.type)}</TD>
                    <TD align="right">{hu.weightKg ? `${formatNumber(hu.weightKg, 2)} kg` : "—"}</TD>
                    <TD className="text-ink-soft">{hu.dimensions ?? "—"}</TD>
                    <TD className="text-xs text-ink-soft">
                      {hu.items.map((i) => `${i.product.name} × ${formatNumber(i.quantity)} ${i.product.unit}`).join(", ") || "—"}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-1">
          {canDeliver && (
            <Card>
              <CardHeader title="Proof of delivery" />
              <CardBody>
                <DeliveredForm action={markDelivered.bind(null, id)} now={toIstDateTimeInput(new Date())} />
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
                    value: doc.customer && (
                      <Link href={`/contacts/${doc.customer.id}`} className="text-brand-700 hover:underline">
                        {doc.customer.name}
                      </Link>
                    ),
                  },
                  { label: "Ship to", value: doc.customer && [doc.customer.shippingAddress ?? doc.customer.billingAddress, doc.customer.city, doc.customer.state].filter(Boolean).join("\n") },
                  {
                    label: "Outbound",
                    value: outbound && (
                      <Link href={`/warehouse/outbound/${outbound.id}`} className="text-brand-700 hover:underline">
                        {outbound.number}
                      </Link>
                    ),
                  },
                  {
                    label: "Sales order",
                    value: outbound && (
                      <Link href={`/sales/orders/${outbound.salesOrder.id}`} className="text-brand-700 hover:underline">
                        {outbound.salesOrder.number}
                      </Link>
                    ),
                  },
                  {
                    label: "Trip",
                    value: doc.trip && (
                      <Link href={`/logistics/trips/${doc.trip.id}`} className="text-brand-700 hover:underline">
                        {doc.trip.number} · {doc.trip.vehicle.registrationNo}
                      </Link>
                    ),
                  },
                  { label: "Issued", value: formatDateTime(doc.issuedAt) },
                  { label: "Expected delivery", value: formatDate(doc.expectedDelivery) },
                  { label: "Delivered", value: doc.deliveredAt ? `${formatDateTime(doc.deliveredAt)}\nReceived by ${doc.receivedBy ?? "—"}` : null },
                  { label: "Notes", value: doc.notes },
                ]}
              />
            </CardBody>
          </Card>
          <ActivityCard entityType="ShippingDocument" entityId={id} />
        </div>
      </div>
    </>
  );
}
