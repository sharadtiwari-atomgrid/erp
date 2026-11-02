import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList, StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney, humanize, num, toDateInput } from "@/lib/format";
import { getCompany } from "@/lib/options";
import { can } from "@/lib/permissions";
import { round2, splitGst } from "@/lib/totals";
import { ActionButton } from "../../_components/action-button";
import { ActivityCard } from "../../_components/activity-card";
import { DocumentLines, DocumentTotals } from "../../_components/document-lines";
import { isOverdue, startOfToday } from "../../_lib/documents";
import { cancelInvoice, issueInvoice, recordPayment } from "../actions";
import { PaymentForm } from "./payment-form";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: PageProps<"/sales/invoices/[id]">) {
  const user = await requireUser("invoices");
  const { id } = await params;
  const [invoice, company] = await Promise.all([
    db.invoice.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, code: true, name: true, gstin: true, state: true, paymentTermsDays: true } },
        salesOrder: { select: { id: true, number: true } },
        lines: { orderBy: { position: "asc" }, include: { product: { select: { id: true, sku: true, name: true, unit: true } } } },
        payments: { orderBy: { date: "desc" } },
      },
    }),
    getCompany(),
  ]);
  if (!invoice) notFound();

  const today = startOfToday();
  const total = num(invoice.total);
  const paid = num(invoice.amountPaid);
  const balance = round2(total - paid);
  const overdue = isOverdue(invoice, today);
  const placeOfSupply = invoice.placeOfSupply ?? invoice.customer.state;
  const gst = splitGst(num(invoice.taxTotal), company.state, placeOfSupply);

  const canEdit = can(user.role, "invoices", "edit");
  const canPay = canEdit && (invoice.status === "ISSUED" || invoice.status === "PARTIALLY_PAID") && balance > 0;
  const canCancel = canEdit && (invoice.status === "DRAFT" || invoice.status === "ISSUED") && invoice.payments.length === 0;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {invoice.number} <StatusBadge status={invoice.status} />
            {overdue && <StatusBadge status="OVERDUE" />}
          </span>
        }
        description={invoice.customer.name}
        back={{ href: "/sales/invoices", label: "Invoices" }}
        actions={
          <>
            {canCancel && (
              <ActionButton action={cancelInvoice.bind(null, id)} variant="ghost" confirmMessage="Cancel this invoice?">
                Cancel invoice
              </ActionButton>
            )}
            {canEdit && invoice.status === "DRAFT" && (
              <ButtonLink href={`/sales/invoices/${id}/edit`} variant="secondary">
                Edit
              </ButtonLink>
            )}
            <ButtonLink href={`/sales/invoices/${id}/print`} variant="secondary">
              Print
            </ButtonLink>
            {canEdit && invoice.status === "DRAFT" && (
              <ActionButton
                action={issueInvoice.bind(null, id)}
                variant="primary"
                pendingText="Issuing…"
                confirmMessage="Issue this invoice? It can’t be edited afterwards."
              >
                Issue invoice
              </ActionButton>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total" value={formatMoney(total)} />
        <StatCard label="Paid" value={formatMoney(paid)} hint={`${invoice.payments.length} payment${invoice.payments.length === 1 ? "" : "s"}`} />
        <StatCard
          label="Balance"
          value={invoice.status === "CANCELLED" ? "—" : formatMoney(balance)}
          tone={overdue ? "danger" : "default"}
        />
        <StatCard
          label="Due date"
          value={formatDate(invoice.dueDate)}
          hint={invoice.dueDate ? (overdue ? "Overdue" : undefined) : `Set on issue (${invoice.customer.paymentTermsDays} days)`}
          tone={overdue ? "danger" : "default"}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Line items" />
            <DocumentLines lines={invoice.lines} />
            <DocumentTotals
              subtotal={invoice.subtotal}
              taxTotal={invoice.taxTotal}
              total={invoice.total}
              extra={
                invoice.status === "CANCELLED"
                  ? undefined
                  : [
                      { label: "Amount paid", value: paid },
                      { label: "Balance due", value: balance, strong: true },
                    ]
              }
            />
          </Card>

          <Card>
            <CardHeader title="Payments" />
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Method</TH>
                  <TH>Reference</TH>
                  <TH align="right">Amount</TH>
                </tr>
              </THead>
              <TBody>
                {invoice.payments.length === 0 && <EmptyRow colSpan={4}>No payments recorded.</EmptyRow>}
                {invoice.payments.map((p) => (
                  <TR key={p.id}>
                    <TD>{formatDate(p.date)}</TD>
                    <TD>{p.method === "UPI" ? "UPI" : humanize(p.method)}</TD>
                    <TD className="text-ink-soft">{p.reference ?? "—"}</TD>
                    <TD align="right">{formatMoney(p.amount)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-1">
          {canPay && (
            <Card>
              <CardHeader title="Record payment" description={`Balance ${formatMoney(balance)}`} />
              <CardBody>
                <PaymentForm action={recordPayment.bind(null, id)} balance={balance} today={toDateInput(new Date())} />
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
                      <Link href={`/crm/customers/${invoice.customer.id}`} className="text-brand-700 hover:underline">
                        {invoice.customer.name}
                      </Link>
                    ),
                  },
                  { label: "Customer GSTIN", value: invoice.customer.gstin },
                  { label: "Invoice date", value: formatDate(invoice.issueDate) },
                  {
                    label: "Sales order",
                    value: invoice.salesOrder && (
                      <Link href={`/sales/orders/${invoice.salesOrder.id}`} className="text-brand-700 hover:underline">
                        {invoice.salesOrder.number}
                      </Link>
                    ),
                  },
                  {
                    label: "Place of supply",
                    value: placeOfSupply ? `${placeOfSupply}${invoice.placeOfSupply ? "" : " (customer’s state)"}` : null,
                  },
                  {
                    label: "GST",
                    value: gst.interState
                      ? `IGST ${formatMoney(gst.igst)}`
                      : `CGST ${formatMoney(gst.cgst)}\nSGST ${formatMoney(gst.sgst)}`,
                  },
                  { label: "Notes", value: invoice.notes },
                ]}
              />
            </CardBody>
          </Card>
          <ActivityCard entityType="Invoice" entityId={id} />
        </div>
      </div>
    </>
  );
}
