import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { getWarehouseOptions } from "@/lib/options";
import { can } from "@/lib/permissions";
import { ActionButton } from "@/components/ui/action-button";
import { ActivityCard } from "../../_components/activity-card";
import { DocumentLines, DocumentTotals } from "../../_components/document-lines";
import { isExpired, startOfToday } from "../../_lib/documents";
import { convertQuotation, setQuotationStatus } from "../actions";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Quotation" };

export default async function QuotationPage({ params }: PageProps<"/sales/quotations/[id]">) {
  const user = await requireUser("quotations");
  const { id } = await params;
  const [quotation, warehouses] = await Promise.all([
    db.quotation.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, code: true, name: true } },
        lines: { orderBy: { position: "asc" }, include: { product: { select: { id: true, sku: true, name: true, unit: true } } } },
        salesOrders: { select: { id: true, number: true, status: true } },
      },
    }),
    getWarehouseOptions(),
  ]);
  if (!quotation) notFound();

  const canEdit = can(user, "quotations", "edit");
  const open = quotation.status === "DRAFT" || quotation.status === "SENT";
  const canConvert = canEdit && can(user, "salesOrders", "edit") && (open || quotation.status === "ACCEPTED");

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {quotation.number} <StatusBadge status={quotation.status} />
            {isExpired(quotation, startOfToday()) && <StatusBadge status="EXPIRED" />}
          </span>
        }
        description={quotation.customer.name}
        back={{ href: "/sales/quotations", label: "Quotations" }}
        actions={
          <>
            {canEdit && quotation.status === "DRAFT" && (
              <ActionButton action={setQuotationStatus.bind(null, id, "SENT")}>Mark sent</ActionButton>
            )}
            {canEdit && open && (
              <>
                <ActionButton action={setQuotationStatus.bind(null, id, "ACCEPTED")}>Mark accepted</ActionButton>
                <ActionButton action={setQuotationStatus.bind(null, id, "REJECTED")} confirmMessage="Mark this quotation as rejected?">
                  Mark rejected
                </ActionButton>
                <ButtonLink href={`/sales/quotations/${id}/edit`} variant="secondary">
                  Edit
                </ButtonLink>
              </>
            )}
            <ButtonLink href={`/sales/quotations/${id}/print`} variant="secondary">
              Print
            </ButtonLink>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DetailList
                items={[
                  {
                    label: "Customer",
                    value: (
                      <Link href={`/contacts/${quotation.customer.id}`} className="text-brand-700 hover:underline">
                        {quotation.customer.name} ({quotation.customer.code})
                      </Link>
                    ),
                  },
                  { label: "Quotation date", value: formatDate(quotation.issueDate) },
                  { label: "Valid until", value: formatDate(quotation.validUntil) },
                  {
                    label: "Sales orders",
                    value: quotation.salesOrders.length
                      ? quotation.salesOrders.map((o) => (
                          <Link key={o.id} href={`/sales/orders/${o.id}`} className="mr-2 text-brand-700 hover:underline">
                            {o.number}
                          </Link>
                        ))
                      : null,
                  },
                  { label: "Notes", value: quotation.notes },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Line items" />
            <DocumentLines lines={quotation.lines} />
            <DocumentTotals subtotal={quotation.subtotal} taxTotal={quotation.taxTotal} total={quotation.total} />
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-1">
          {canConvert && (
            <Card>
              <CardHeader title="Convert to sales order" description="Copies every line into a new draft order." />
              <CardBody>
                <ActionButton
                  action={convertQuotation.bind(null, id)}
                  variant="primary"
                  pendingText="Converting…"
                  fields={
                    <Select name="warehouseId" aria-label="Warehouse" required defaultValue={warehouses[0]?.id ?? ""}>
                      <option value="">Warehouse…</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </Select>
                  }
                >
                  Convert
                </ActionButton>
              </CardBody>
            </Card>
          )}
          <ActivityCard entityType="Quotation" entityId={id} />
        </div>
      </div>
    </>
  );
}
