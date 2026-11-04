import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { money } from "@/lib/finance/chart";
import { formatMoney, humanize, num } from "@/lib/format";
import { formatDmy } from "@/lib/ops/dates";
import { getCompany } from "@/lib/options";
import { amountInWords } from "../../../../sales/_lib/amount-in-words";
import { PrintSheet, printCell } from "../../../_ar_ap/ui";

export const metadata: Metadata = { title: "Payment advice" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function PrintVendorPaymentPage({ params }: PageProps<"/finance/vendor-payments/[id]/print">) {
  await requireUser("finance");
  const { id } = await params;
  const [payment, company] = await Promise.all([
    db.vendorPayment.findUnique({
      where: { id },
      include: {
        supplier: true,
        bankAccount: { select: { name: true } },
        tdsSection: { select: { code: true } },
        applications: {
          include: { purchaseInvoice: { select: { number: true, supplierInvoiceNo: true, invoiceDate: true, total: true } } },
          orderBy: { purchaseInvoice: { number: "asc" } },
        },
      },
    }),
    getCompany(),
  ]);
  if (!payment) notFound();
  const s = payment.supplier;
  const cash = num(payment.amount);
  const tds = num(payment.tdsAmount);
  const advance = num(payment.unappliedAmount);
  const applied = money(payment.applications.reduce((sum, a) => sum + num(a.amount), 0));
  const mode = payment.method === "UPI" ? "UPI" : humanize(payment.method);

  return (
    <PrintSheet
      title={payment.status === "CANCELLED" ? "Payment advice (cancelled)" : payment.status === "DRAFT" ? "Payment advice (draft)" : "Payment advice"}
      backHref={`/finance/vendor-payments/${id}`}
      company={company}
      meta={[
        { label: "Advice no.", value: payment.number },
        { label: "Date", value: formatDmy(payment.date) },
        { label: "Mode", value: mode },
        ...(payment.reference ? [{ label: "Reference", value: payment.reference }] : []),
      ]}
      partyLabel="Paid to"
      party={{ name: s.name, gstin: s.gstin, pan: s.pan, address: s.billingAddress, city: s.city, state: s.state, pincode: s.pincode }}
      footerNote={payment.notes}
    >
      <p className="text-sm">
        We have paid <strong>{formatMoney(cash)}</strong> ({amountInWords(cash)}) by {mode.toLowerCase()} from {payment.bankAccount.name}
        {payment.reference ? `, reference ${payment.reference}` : ""}, as detailed below.
      </p>
      <table className="mt-4 w-full border-collapse text-xs">
        <thead className="bg-muted">
          <tr>
            <th className={`${printCell} text-left`}>Your invoice</th>
            <th className={`${printCell} text-left`}>Our ref.</th>
            <th className={`${printCell} text-left`}>Date</th>
            <th className={`${printCell} text-right`}>Invoice total</th>
            <th className={`${printCell} text-right`}>Settled</th>
          </tr>
        </thead>
        <tbody>
          {payment.applications.length === 0 && (
            <tr>
              <td colSpan={5} className={`${printCell} text-center`}>
                Advance payment
              </td>
            </tr>
          )}
          {payment.applications.map((a) => (
            <tr key={a.id}>
              <td className={printCell}>{a.purchaseInvoice.supplierInvoiceNo ?? "—"}</td>
              <td className={printCell}>{a.purchaseInvoice.number}</td>
              <td className={printCell}>{formatDmy(a.purchaseInvoice.invoiceDate)}</td>
              <td className={`${printCell} text-right tabular-nums`}>{formatMoney(a.purchaseInvoice.total)}</td>
              <td className={`${printCell} text-right tabular-nums`}>{formatMoney(a.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="mt-4 ml-auto w-72 space-y-1 text-sm">
        <div className="flex justify-between">
          <dt>Invoices settled</dt>
          <dd className="tabular-nums">{formatMoney(applied)}</dd>
        </div>
        {tds > 0 && (
          <div className="flex justify-between">
            <dt>Less TDS{payment.tdsSection ? ` u/s ${payment.tdsSection.code}` : ""}</dt>
            <dd className="tabular-nums">{formatMoney(tds)}</dd>
          </div>
        )}
        {advance > 0 && (
          <div className="flex justify-between">
            <dt>Advance</dt>
            <dd className="tabular-nums">{formatMoney(advance)}</dd>
          </div>
        )}
        <div className="flex justify-between border-t border-line pt-1 font-semibold">
          <dt>Net paid</dt>
          <dd className="tabular-nums">{formatMoney(cash)}</dd>
        </div>
      </dl>
    </PrintSheet>
  );
}
