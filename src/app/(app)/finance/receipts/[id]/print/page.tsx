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

export const metadata: Metadata = { title: "Print receipt" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function PrintReceiptPage({ params }: PageProps<"/finance/receipts/[id]/print">) {
  await requireUser("finance");
  const { id } = await params;
  const [receipt, company] = await Promise.all([
    db.cashReceipt.findUnique({
      where: { id },
      include: {
        customer: true,
        bankAccount: { select: { name: true } },
        applications: { include: { invoice: { select: { number: true, issueDate: true, total: true } } }, orderBy: { invoice: { number: "asc" } } },
      },
    }),
    getCompany(),
  ]);
  if (!receipt) notFound();
  const amount = num(receipt.amount);
  const tds = num(receipt.tdsAmount);
  const applied = money(receipt.applications.reduce((s, a) => s + num(a.amount), 0));
  const c = receipt.customer;

  return (
    <PrintSheet
      title={receipt.status === "CANCELLED" ? "Receipt (cancelled)" : receipt.status === "DRAFT" ? "Draft receipt" : "Receipt"}
      backHref={`/finance/receipts/${id}`}
      company={company}
      meta={[
        { label: "Receipt no.", value: receipt.number },
        { label: "Posting Date", value: formatDmy(receipt.date) },
        { label: "Mode", value: receipt.method === "UPI" ? "UPI" : humanize(receipt.method) },
        ...(receipt.reference ? [{ label: "Reference", value: receipt.reference }] : []),
      ]}
      partyLabel="Received from"
      party={{ name: c.name, gstin: c.gstin, pan: c.pan, address: c.billingAddress, city: c.city, state: c.state, pincode: c.pincode }}
      footerNote={receipt.notes}
    >
      <p className="text-sm">
        Received with thanks the sum of <strong>{formatMoney(amount)}</strong> ({amountInWords(amount)}) by {receipt.method === "UPI" ? "UPI" : humanize(receipt.method).toLowerCase()}
        {receipt.reference ? `, reference ${receipt.reference}` : ""}, deposited to {receipt.bankAccount.name}.
      </p>
      <table className="mt-4 w-full border-collapse text-xs">
        <thead className="bg-muted">
          <tr>
            <th className={`${printCell} text-left`}>Against invoice</th>
            <th className={`${printCell} text-left`}>Invoice date</th>
            <th className={`${printCell} text-right`}>Invoice total</th>
            <th className={`${printCell} text-right`}>Settled</th>
          </tr>
        </thead>
        <tbody>
          {receipt.applications.length === 0 && (
            <tr>
              <td colSpan={4} className={`${printCell} text-center`}>
                On account (advance)
              </td>
            </tr>
          )}
          {receipt.applications.map((a) => (
            <tr key={a.id}>
              <td className={printCell}>{a.invoice.number}</td>
              <td className={printCell}>{formatDmy(a.invoice.issueDate)}</td>
              <td className={`${printCell} text-right tabular-nums`}>{formatMoney(a.invoice.total)}</td>
              <td className={`${printCell} text-right tabular-nums`}>{formatMoney(a.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="mt-4 ml-auto w-72 space-y-1 text-sm">
        <div className="flex justify-between">
          <dt>Amount received</dt>
          <dd className="tabular-nums">{formatMoney(amount)}</dd>
        </div>
        {tds > 0 && (
          <div className="flex justify-between">
            <dt>TDS deducted by you</dt>
            <dd className="tabular-nums">{formatMoney(tds)}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt>Settled against invoices</dt>
          <dd className="tabular-nums">{formatMoney(applied)}</dd>
        </div>
        <div className="flex justify-between border-t border-line pt-1 font-semibold">
          <dt>Held on account</dt>
          <dd className="tabular-nums">{formatMoney(money(amount + tds - applied))}</dd>
        </div>
      </dl>
    </PrintSheet>
  );
}
