import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList, StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { money } from "@/lib/finance/chart";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { formatMoney, formatNumber, num } from "@/lib/format";
import { formatDmy, isoFromDay, todayIso } from "@/lib/ops/dates";
import { getCompany } from "@/lib/options";
import { can } from "@/lib/permissions";
import { splitGst } from "@/lib/totals";
import { ActivityCard } from "../../../sales/_components/activity-card";
import { LedgerEntriesCard } from "../../_ar_ap/ledger-card";
import { PostingPreviewCard } from "../../_ar_ap/posting-preview";
import { purchaseInvoicePostingLines } from "../../_ar_ap/postings";
import { DocStatus } from "../../_ar_ap/ui";
import { cancelBill, deleteDraftBill, postBill } from "../actions";

export const metadata: Metadata = { title: "Purchase Invoice" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function PurchaseInvoicePage({ params }: PageProps<"/finance/purchase-invoices/[id]">) {
  const user = await requireUser("finance");
  await ensureFinanceSetup();
  const { id } = await params;
  const [bill, company] = await Promise.all([
    db.purchaseInvoice.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, code: true, name: true, gstin: true, state: true } },
        branch: { select: { name: true } },
        purchaseOrder: { select: { id: true, number: true } },
        inboundReceipt: { select: { id: true, number: true } },
        lines: {
          orderBy: { position: "asc" },
          include: { product: { select: { sku: true, name: true, unit: true } }, glAccount: { select: { code: true, name: true } } },
        },
        applications: { include: { payment: { select: { id: true, number: true, date: true, status: true, method: true } } } },
      },
    }),
    getCompany(),
  ]);
  if (!bill) notFound();

  const total = num(bill.total);
  const paid = num(bill.amountPaid);
  const balance = money(total - paid);
  const open = bill.status === "POSTED" || bill.status === "PARTIALLY_PAID";
  const late = open && bill.dueDate && isoFromDay(bill.dueDate) < todayIso();
  const placeOfSupply = bill.placeOfSupply ?? bill.supplier.state;
  const gst = splitGst(num(bill.taxTotal), company.state, placeOfSupply);
  const canEdit = can(user, "finance", "edit");
  const livePayments = bill.applications.filter((a) => a.payment.status !== "CANCELLED");

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {bill.number} <DocStatus status={bill.status} />
            {late && <Badge tone="red">Overdue</Badge>}
          </span>
        }
        description={`${bill.supplier.name}${bill.supplierInvoiceNo ? ` · vendor invoice ${bill.supplierInvoiceNo}` : ""}`}
        back={{ href: "/finance/purchase-invoices", label: "Purchase Invoices" }}
        actions={
          <>
            {canEdit && bill.status === "DRAFT" && (
              <ActionButton action={deleteDraftBill.bind(null, id)} variant="ghost" confirmMessage="Delete this draft bill?">
                Delete draft
              </ActionButton>
            )}
            {canEdit && bill.status === "POSTED" && livePayments.length === 0 && (
              <ActionButton
                action={cancelBill.bind(null, id)}
                variant="ghost"
                pendingText="Cancelling…"
                confirmMessage="Cancel this bill? Its posting is reversed today."
              >
                Cancel purchase invoice
              </ActionButton>
            )}
            {canEdit && bill.status === "DRAFT" && (
              <ButtonLink href={`/finance/purchase-invoices/${id}/edit`} variant="secondary">
                Edit
              </ButtonLink>
            )}
            <ButtonLink href={`/finance/purchase-invoices/${id}/print`} variant="secondary">
              Print
            </ButtonLink>
            {canEdit && open && balance > 0 && (
              <ButtonLink href={`/finance/vendor-payments/new?supplierId=${bill.supplierId}&billId=${id}`} variant="secondary">
                Pay
              </ButtonLink>
            )}
            {canEdit && bill.status === "DRAFT" && (
              <ActionButton action={postBill.bind(null, id)} variant="primary" pendingText="Posting…" confirmMessage="Post this bill? It can’t be edited afterwards.">
                Post
              </ActionButton>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total" value={formatMoney(total)} hint={`Taxable ${formatMoney(bill.subtotal)}`} />
        <StatCard label="Paid" value={formatMoney(paid)} hint={`${livePayments.length} payment${livePayments.length === 1 ? "" : "s"}`} />
        <StatCard label="Balance" value={bill.status === "CANCELLED" || bill.status === "DRAFT" ? "—" : formatMoney(balance)} tone={late ? "danger" : "default"} />
        <StatCard label="Due date" value={formatDmy(bill.dueDate) || "—"} tone={late ? "danger" : "default"} hint={late ? "Overdue" : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Lines" />
            <Table>
              <THead>
                <tr>
                  <TH>Item / account</TH>
                  <TH>HSN/SAC</TH>
                  <TH align="right">Qty</TH>
                  <TH align="right">Rate</TH>
                  <TH align="right">Disc %</TH>
                  <TH align="right">Taxable</TH>
                  <TH align="right">GST</TH>
                </tr>
              </THead>
              <TBody>
                {bill.lines.length === 0 && <EmptyRow colSpan={7}>No lines.</EmptyRow>}
                {bill.lines.map((l) => (
                  <TR key={l.id}>
                    <TD>
                      {l.product ? (
                        <span className="font-medium">{l.product.name}</span>
                      ) : (
                        <span>
                          <span className="font-mono text-xs text-ink-soft">{l.glAccount?.code}</span> {l.glAccount?.name}
                        </span>
                      )}
                      {l.description && <p className="text-xs text-ink-soft">{l.description}</p>}
                    </TD>
                    <TD className="font-mono text-xs text-ink-soft">{l.hsnCode ?? "—"}</TD>
                    <TD align="right">
                      {formatNumber(l.quantity)} {l.product?.unit ?? ""}
                    </TD>
                    <TD align="right">{formatMoney(l.unitPrice)}</TD>
                    <TD align="right">{num(l.discountPct) ? formatNumber(l.discountPct, 2) : "—"}</TD>
                    <TD align="right">{formatMoney(l.lineTotal)}</TD>
                    <TD align="right">
                      {formatMoney(l.taxAmount)} <span className="text-xs text-ink-faint">@{formatNumber(l.taxRate, 2)}%</span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <dl className="ml-auto w-full max-w-sm space-y-1 px-5 py-4 text-sm">
              <div className="flex justify-between">
                <dt>Taxable value</dt>
                <dd className="tabular-nums">{formatMoney(bill.subtotal)}</dd>
              </div>
              {gst.interState ? (
                <div className="flex justify-between">
                  <dt>IGST</dt>
                  <dd className="tabular-nums">{formatMoney(gst.igst)}</dd>
                </div>
              ) : (
                <>
                  <div className="flex justify-between">
                    <dt>CGST</dt>
                    <dd className="tabular-nums">{formatMoney(gst.cgst)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>SGST</dt>
                    <dd className="tabular-nums">{formatMoney(gst.sgst)}</dd>
                  </div>
                </>
              )}
              <div className="flex justify-between border-t border-line pt-1 font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatMoney(total)}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Payments" />
            <Table>
              <THead>
                <tr>
                  <TH>Payment</TH>
                  <TH>Posting Date</TH>
                  <TH>Status</TH>
                  <TH align="right">Settled</TH>
                </tr>
              </THead>
              <TBody>
                {bill.applications.length === 0 && <EmptyRow colSpan={4}>No payments yet.</EmptyRow>}
                {bill.applications.map((a) => (
                  <TR key={a.id}>
                    <TD>
                      <Link href={`/finance/vendor-payments/${a.payment.id}`} className="font-medium text-brand-700 hover:underline">
                        {a.payment.number}
                      </Link>
                    </TD>
                    <TD className="text-ink-soft">{formatDmy(a.payment.date)}</TD>
                    <TD>
                      <DocStatus status={a.payment.status} />
                    </TD>
                    <TD align="right">{formatMoney(a.amount)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>

          {bill.status === "DRAFT" ? (
            bill.lines.length > 0 && (
              <PostingPreviewCard
                lines={purchaseInvoicePostingLines({
                  supplierId: bill.supplierId,
                  lines: bill.lines.map((l) => ({ glAccountId: l.productId ? null : l.glAccountId, lineTotal: num(l.lineTotal), taxAmount: num(l.taxAmount) })),
                  taxTotal: num(bill.taxTotal),
                  total,
                  itcEligible: bill.itcEligible,
                  companyState: company.state,
                  placeOfSupply,
                })}
              />
            )
          ) : (
            <LedgerEntriesCard sourceType="PurchaseInvoice" sourceId={id} />
          )}
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
                      <Link href={`/contacts/${bill.supplier.id}`} className="text-brand-700 hover:underline">
                        {bill.supplier.name}
                      </Link>
                    ),
                  },
                  { label: "Vendor GSTIN", value: bill.supplier.gstin },
                  { label: "Vendor invoice no.", value: bill.supplierInvoiceNo },
                  { label: "Invoice date", value: formatDmy(bill.invoiceDate) },
                  { label: "Branch", value: bill.branch.name },
                  { label: "Place of supply", value: placeOfSupply ? `${placeOfSupply}${bill.placeOfSupply ? "" : " (supplier’s state)"}` : null },
                  { label: "Input tax credit", value: bill.itcEligible ? "Eligible" : "Not eligible (GST added to cost)" },
                  {
                    label: "Purchase order",
                    value: bill.purchaseOrder && (
                      <Link href={`/purchasing/orders/${bill.purchaseOrder.id}`} className="text-brand-700 hover:underline">
                        {bill.purchaseOrder.number}
                      </Link>
                    ),
                  },
                  {
                    label: "Goods receipt",
                    value: bill.inboundReceipt && (
                      <Link href={`/warehouse/inbound/${bill.inboundReceipt.id}`} className="text-brand-700 hover:underline">
                        {bill.inboundReceipt.number}
                      </Link>
                    ),
                  },
                  { label: "Transaction no.", value: bill.transactionNo },
                  { label: "Notes", value: bill.notes },
                ]}
              />
            </CardBody>
          </Card>
          <ActivityCard entityType="PurchaseInvoice" entityId={id} />
        </div>
      </div>
    </>
  );
}
