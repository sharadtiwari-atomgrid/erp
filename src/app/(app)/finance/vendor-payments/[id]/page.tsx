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
import { money } from "@/lib/finance/chart";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { formatMoney, formatNumber, humanize, num } from "@/lib/format";
import { formatDmy } from "@/lib/ops/dates";
import { can } from "@/lib/permissions";
import { ActivityCard } from "../../../sales/_components/activity-card";
import { LedgerEntriesCard } from "../../_ar_ap/ledger-card";
import { DocStatus } from "../../_ar_ap/ui";
import { cancelPayment, deleteDraftPayment, postPayment } from "../actions";

export const metadata: Metadata = { title: "Vendor Payment" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function VendorPaymentPage({ params }: PageProps<"/finance/vendor-payments/[id]">) {
  const user = await requireUser("finance");
  await ensureFinanceSetup();
  const { id } = await params;
  const [payment, tdsEntries] = await Promise.all([
    db.vendorPayment.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, code: true, name: true, gstin: true, pan: true } },
        bankAccount: { select: { name: true, code: true } },
        tdsSection: { select: { code: true, description: true } },
        applications: {
          include: { purchaseInvoice: { select: { id: true, number: true, supplierInvoiceNo: true, invoiceDate: true, total: true } } },
          orderBy: { purchaseInvoice: { number: "asc" } },
        },
      },
    }),
    db.tdsEntry.findMany({ where: { sourceId: id, documentType: "Vendor payment" }, include: { section: { select: { code: true } } } }),
  ]);
  if (!payment) notFound();

  const cash = num(payment.amount);
  const tds = num(payment.tdsAmount);
  const advance = num(payment.unappliedAmount);
  const applied = money(payment.applications.reduce((s, a) => s + num(a.amount), 0));
  const canEdit = can(user, "finance", "edit");

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {payment.number} <DocStatus status={payment.status} />
          </span>
        }
        description={`${payment.supplier.name} · ${formatDmy(payment.date)}`}
        back={{ href: "/finance/vendor-payments", label: "Payment Journals" }}
        actions={
          <>
            {canEdit && payment.status === "DRAFT" && (
              <ActionButton action={deleteDraftPayment.bind(null, id)} variant="ghost" confirmMessage="Delete this draft payment?">
                Delete draft
              </ActionButton>
            )}
            {canEdit && payment.status === "POSTED" && (
              <ActionButton
                action={cancelPayment.bind(null, id)}
                variant="ghost"
                pendingText="Cancelling…"
                confirmMessage="Cancel this payment? Its posting and TDS entry are reversed today and the bills become unpaid again."
              >
                Cancel payment
              </ActionButton>
            )}
            <ButtonLink href={`/finance/vendor-payments/${id}/print`} variant="secondary">
              Print advice
            </ButtonLink>
            {canEdit && payment.status === "DRAFT" && (
              <ActionButton action={postPayment.bind(null, id)} variant="primary" pendingText="Posting…" confirmMessage="Post this payment to the ledger?">
                Post
              </ActionButton>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Paid from bank" value={formatMoney(cash)} />
        <StatCard label="Applied Entries" value={formatMoney(applied)} hint={`${payment.applications.length} purchase invoice${payment.applications.length === 1 ? "" : "s"}`} />
        <StatCard label="TDS withheld" value={formatMoney(tds)} hint={payment.tdsSection ? `Section ${payment.tdsSection.code}` : "No TDS"} />
        <StatCard label="Advance" value={formatMoney(advance)} hint="Not against a purchase invoice" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Applied Entries" />
            <Table>
              <THead>
                <tr>
                  <TH>Purchase invoice</TH>
                  <TH>Vendor inv.</TH>
                  <TH>Posting Date</TH>
                  <TH align="right">Purchase invoice total</TH>
                  <TH align="right">Settled</TH>
                </tr>
              </THead>
              <TBody>
                {payment.applications.length === 0 && <EmptyRow colSpan={5}>Not applied to any purchase invoice: the whole payment is an advance.</EmptyRow>}
                {payment.applications.map((a) => (
                  <TR key={a.id}>
                    <TD>
                      <Link href={`/finance/purchase-invoices/${a.purchaseInvoice.id}`} className="font-medium text-brand-700 hover:underline">
                        {a.purchaseInvoice.number}
                      </Link>
                    </TD>
                    <TD className="text-ink-soft">{a.purchaseInvoice.supplierInvoiceNo ?? "—"}</TD>
                    <TD className="text-ink-soft">{formatDmy(a.purchaseInvoice.invoiceDate)}</TD>
                    <TD align="right">{formatMoney(a.purchaseInvoice.total)}</TD>
                    <TD align="right">{formatMoney(a.amount)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          {tdsEntries.length > 0 && (
            <Card>
              <CardHeader title="TDS entry" />
              <Table>
                <THead>
                  <tr>
                    <TH>Section</TH>
                    <TH>Quarter</TH>
                    <TH>Status</TH>
                    <TH align="right">Base</TH>
                    <TH align="right">Rate</TH>
                    <TH align="right">TDS</TH>
                  </tr>
                </THead>
                <TBody>
                  {tdsEntries.map((e) => (
                    <TR key={e.id}>
                      <TD>{e.section.code}</TD>
                      <TD className="text-ink-soft">{e.quarter}</TD>
                      <TD className="text-ink-soft">{humanize(e.status)}</TD>
                      <TD align="right">{formatMoney(e.baseAmount)}</TD>
                      <TD align="right">{formatNumber(e.rate, 3)}%</TD>
                      <TD align="right">{formatMoney(e.amount)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          )}
          <LedgerEntriesCard sourceType="VendorPayment" sourceId={id} />
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DetailList
                items={[
                  {
                    label: "Vendor",
                    value: (
                      <Link href={`/contacts/${payment.supplier.id}`} className="text-brand-700 hover:underline">
                        {payment.supplier.name}
                      </Link>
                    ),
                  },
                  { label: "PAN / GSTIN", value: [payment.supplier.pan, payment.supplier.gstin].filter(Boolean).join(" · ") || null },
                  { label: "Posting Date", value: formatDmy(payment.date) },
                  { label: "Paid from", value: `${payment.bankAccount.name} (${payment.bankAccount.code})` },
                  { label: "Method", value: payment.method === "UPI" ? "UPI" : humanize(payment.method) },
                  { label: "Reference", value: payment.reference },
                  { label: "TDS section", value: payment.tdsSection ? `${payment.tdsSection.code} · ${payment.tdsSection.description}` : null },
                  { label: "Transaction no.", value: payment.transactionNo },
                  { label: "Notes", value: payment.notes },
                ]}
              />
            </CardBody>
          </Card>
          <ActivityCard entityType="VendorPayment" entityId={id} />
        </div>
      </div>
    </>
  );
}
