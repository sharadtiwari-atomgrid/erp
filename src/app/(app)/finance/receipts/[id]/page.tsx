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
import { formatMoney, humanize, num } from "@/lib/format";
import { formatDmy } from "@/lib/ops/dates";
import { can } from "@/lib/permissions";
import { ActivityCard } from "../../../sales/_components/activity-card";
import { LedgerEntriesCard } from "../../_ar_ap/ledger-card";
import { DocStatus } from "../../_ar_ap/ui";
import { cancelReceipt, deleteDraftReceipt, postReceipt } from "../actions";

export const metadata: Metadata = { title: "Cash Receipt" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function ReceiptPage({ params }: PageProps<"/finance/receipts/[id]">) {
  const user = await requireUser("finance");
  await ensureFinanceSetup();
  const { id } = await params;
  const receipt = await db.cashReceipt.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, code: true, name: true, gstin: true } },
      bankAccount: { select: { name: true, code: true } },
      applications: {
        include: { invoice: { select: { id: true, number: true, issueDate: true, dueDate: true, total: true, amountPaid: true, status: true } } },
        orderBy: { invoice: { number: "asc" } },
      },
    },
  });
  if (!receipt) notFound();

  const amount = num(receipt.amount);
  const tds = num(receipt.tdsAmount);
  const applied = money(receipt.applications.reduce((s, a) => s + num(a.amount), 0));
  const unapplied = money(amount + tds - applied);
  const canEdit = can(user, "finance", "edit");

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {receipt.number} <DocStatus status={receipt.status} />
          </span>
        }
        description={`${receipt.customer.name} · ${formatDmy(receipt.date)}`}
        back={{ href: "/finance/receipts", label: "Cash Receipt Journals" }}
        actions={
          <>
            {canEdit && receipt.status === "DRAFT" && (
              <ActionButton action={deleteDraftReceipt.bind(null, id)} variant="ghost" confirmMessage="Delete this draft receipt?">
                Delete draft
              </ActionButton>
            )}
            {canEdit && receipt.status === "POSTED" && (
              <ActionButton
                action={cancelReceipt.bind(null, id)}
                variant="ghost"
                pendingText="Cancelling…"
                confirmMessage="Cancel this receipt? Its posting is reversed today and the invoices become unpaid again."
              >
                Cancel receipt
              </ActionButton>
            )}
            <ButtonLink href={`/finance/receipts/${id}/print`} variant="secondary">
              Print
            </ButtonLink>
            {canEdit && receipt.status === "DRAFT" && (
              <ActionButton action={postReceipt.bind(null, id)} variant="primary" pendingText="Posting…" confirmMessage="Post this receipt to the ledger?">
                Post
              </ActionButton>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Amount received" value={formatMoney(amount)} />
        <StatCard label="TDS deducted" value={formatMoney(tds)} hint="Credited to TDS receivable" />
        <StatCard label="Applied Entries" value={formatMoney(applied)} hint={`${receipt.applications.length} invoice${receipt.applications.length === 1 ? "" : "s"}`} />
        <StatCard label="Unapplied (advance)" value={formatMoney(receipt.status === "CANCELLED" ? 0 : unapplied)} tone={unapplied > 0 && receipt.status === "POSTED" ? "warning" : "default"} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Applied Entries" />
            <Table>
              <THead>
                <tr>
                  <TH>Invoice</TH>
                  <TH>Posting Date</TH>
                  <TH>Due</TH>
                  <TH align="right">Invoice total</TH>
                  <TH align="right">Applied</TH>
                </tr>
              </THead>
              <TBody>
                {receipt.applications.length === 0 && <EmptyRow colSpan={5}>Not applied to any invoice: the whole amount is a customer advance.</EmptyRow>}
                {receipt.applications.map((a) => (
                  <TR key={a.id}>
                    <TD>
                      <Link href={`/sales/invoices/${a.invoice.id}`} className="font-medium text-brand-700 hover:underline">
                        {a.invoice.number}
                      </Link>
                    </TD>
                    <TD className="text-ink-soft">{formatDmy(a.invoice.issueDate)}</TD>
                    <TD className="text-ink-soft">{formatDmy(a.invoice.dueDate)}</TD>
                    <TD align="right">{formatMoney(a.invoice.total)}</TD>
                    <TD align="right">{formatMoney(a.amount)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <LedgerEntriesCard sourceType="CashReceipt" sourceId={id} />
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DetailList
                items={[
                  {
                    label: "Customer",
                    value: (
                      <Link href={`/contacts/${receipt.customer.id}`} className="text-brand-700 hover:underline">
                        {receipt.customer.name}
                      </Link>
                    ),
                  },
                  { label: "Customer GSTIN", value: receipt.customer.gstin },
                  { label: "Posting Date", value: formatDmy(receipt.date) },
                  { label: "Deposited to", value: `${receipt.bankAccount.name} (${receipt.bankAccount.code})` },
                  { label: "Method", value: receipt.method === "UPI" ? "UPI" : humanize(receipt.method) },
                  { label: "Reference", value: receipt.reference },
                  { label: "Transaction no.", value: receipt.transactionNo },
                  { label: "Notes", value: receipt.notes },
                ]}
              />
            </CardBody>
          </Card>
          <ActivityCard entityType="CashReceipt" entityId={id} />
        </div>
      </div>
    </>
  );
}
