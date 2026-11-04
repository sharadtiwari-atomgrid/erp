import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney, formatNumber, num } from "@/lib/format";
import { formatDmy } from "@/lib/ops/dates";
import { getCompany } from "@/lib/options";
import { splitGst } from "@/lib/totals";
import { amountInWords } from "../../../../sales/_lib/amount-in-words";
import { PrintSheet, printCell } from "../../../_ar_ap/ui";

export const metadata: Metadata = { title: "Print purchase invoice" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function PrintPurchaseInvoicePage({ params }: PageProps<"/finance/purchase-invoices/[id]/print">) {
  await requireUser("finance");
  const { id } = await params;
  const [bill, company] = await Promise.all([
    db.purchaseInvoice.findUnique({
      where: { id },
      include: {
        supplier: true,
        purchaseOrder: { select: { number: true } },
        inboundReceipt: { select: { number: true } },
        lines: { orderBy: { position: "asc" }, include: { product: { select: { name: true, unit: true } }, glAccount: { select: { code: true, name: true } } } },
      },
    }),
    getCompany(),
  ]);
  if (!bill) notFound();
  const s = bill.supplier;
  const placeOfSupply = bill.placeOfSupply ?? s.state;
  const gst = splitGst(num(bill.taxTotal), company.state, placeOfSupply);
  const total = num(bill.total);

  return (
    <PrintSheet
      title={bill.status === "CANCELLED" ? "Purchase invoice (cancelled)" : bill.status === "DRAFT" ? "Purchase invoice (draft)" : "Purchase invoice"}
      backHref={`/finance/purchase-invoices/${id}`}
      company={company}
      meta={[
        { label: "Our ref.", value: bill.number },
        { label: "Supplier inv. no.", value: bill.supplierInvoiceNo ?? "—" },
        { label: "Invoice date", value: formatDmy(bill.invoiceDate) },
        { label: "Due date", value: formatDmy(bill.dueDate) || "—" },
        ...(bill.purchaseOrder ? [{ label: "PO", value: bill.purchaseOrder.number }] : []),
        ...(bill.inboundReceipt ? [{ label: "GRN", value: bill.inboundReceipt.number }] : []),
      ]}
      partyLabel="Supplier"
      party={{ name: s.name, gstin: s.gstin, pan: s.pan, address: s.billingAddress, city: s.city, state: s.state, pincode: s.pincode }}
      footerNote={
        <>
          <p>Place of supply: {placeOfSupply ?? "—"} · {gst.interState ? "Inter-state (IGST)" : "Intra-state (CGST + SGST)"}</p>
          <p>Input tax credit: {bill.itcEligible ? "eligible" : "not eligible"}</p>
          {bill.notes && <p className="mt-2 whitespace-pre-line">{bill.notes}</p>}
        </>
      }
    >
      <table className="w-full border-collapse text-xs">
        <thead className="bg-muted">
          <tr>
            <th className={`${printCell} w-8 text-left`}>#</th>
            <th className={`${printCell} text-left`}>Item / account</th>
            <th className={`${printCell} text-left`}>HSN/SAC</th>
            <th className={`${printCell} text-right`}>Qty</th>
            <th className={`${printCell} text-right`}>Rate</th>
            <th className={`${printCell} text-right`}>Disc %</th>
            <th className={`${printCell} text-right`}>Taxable</th>
            <th className={`${printCell} text-right`}>GST %</th>
            <th className={`${printCell} text-right`}>GST</th>
            <th className={`${printCell} text-right`}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {bill.lines.map((l, i) => (
            <tr key={l.id} className="break-inside-avoid align-top">
              <td className={printCell}>{i + 1}</td>
              <td className={printCell}>
                <p className="font-medium">{l.product?.name ?? `${l.glAccount?.code ?? ""} ${l.glAccount?.name ?? ""}`}</p>
                {l.description && <p className="text-ink-soft">{l.description}</p>}
              </td>
              <td className={`${printCell} font-mono`}>{l.hsnCode ?? "—"}</td>
              <td className={`${printCell} text-right tabular-nums`}>
                {formatNumber(l.quantity)} {l.product?.unit ?? ""}
              </td>
              <td className={`${printCell} text-right tabular-nums`}>{formatMoney(l.unitPrice)}</td>
              <td className={`${printCell} text-right tabular-nums`}>{num(l.discountPct) ? formatNumber(l.discountPct, 2) : "—"}</td>
              <td className={`${printCell} text-right tabular-nums`}>{formatMoney(l.lineTotal)}</td>
              <td className={`${printCell} text-right tabular-nums`}>{formatNumber(l.taxRate, 2)}</td>
              <td className={`${printCell} text-right tabular-nums`}>{formatMoney(l.taxAmount)}</td>
              <td className={`${printCell} text-right tabular-nums`}>{formatMoney(num(l.lineTotal) + num(l.taxAmount))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <section className="mt-4 flex flex-wrap items-start justify-between gap-6 break-inside-avoid">
        <div className="max-w-sm text-xs">
          <p className="font-semibold uppercase tracking-wide text-ink-soft">Amount in words</p>
          <p className="mt-1 font-medium">{amountInWords(total)}</p>
        </div>
        <dl className="w-72 space-y-1 text-sm">
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
          <div className="flex justify-between border-t-2 border-ink pt-1 text-base font-bold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatMoney(total)}</dd>
          </div>
          {num(bill.amountPaid) > 0 && (
            <>
              <div className="flex justify-between">
                <dt>Paid</dt>
                <dd className="tabular-nums">{formatMoney(bill.amountPaid)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Balance</dt>
                <dd className="tabular-nums">{formatMoney(total - num(bill.amountPaid))}</dd>
              </div>
            </>
          )}
        </dl>
      </section>
    </PrintSheet>
  );
}
