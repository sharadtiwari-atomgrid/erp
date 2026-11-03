import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney, formatNumber, num } from "@/lib/format";
import { splitGst } from "@/lib/totals";
import { PrintButton } from "@/components/ui/print-button";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Print purchase order" };

export default async function PrintPurchaseOrderPage({ params }: PageProps<"/purchasing/orders/[id]/print">) {
  await requireUser("purchaseOrders");
  const { id } = await params;
  const [order, company] = await Promise.all([
    db.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        warehouse: true,
        lines: { orderBy: { position: "asc" }, include: { product: { select: { sku: true, name: true, unit: true, hsnCode: true } } } },
      },
    }),
    db.companySettings.findUnique({ where: { id: 1 } }),
  ]);
  if (!order) notFound();

  // Inward supply: compare the supplier's state with ours for CGST/SGST vs IGST.
  const gst = splitGst(num(order.taxTotal), company?.state, order.supplier.state);
  const companyAddress = [company?.address, [company?.city, company?.state, company?.pincode].filter(Boolean).join(", ")].filter(Boolean).join("\n");
  const supplierAddress = [order.supplier.billingAddress, [order.supplier.city, order.supplier.state, order.supplier.pincode].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join("\n");

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={`Print ${order.number}`}
          back={{ href: `/purchasing/orders/${id}`, label: order.number }}
          actions={<PrintButton>Print purchase order</PrintButton>}
        />
      </div>

      <article className="mx-auto max-w-4xl rounded-lg border border-line bg-white p-8 text-sm text-ink shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
          <div>
            <p className="text-lg font-semibold">{company?.legalName ?? company?.name ?? "My Company"}</p>
            {companyAddress && <p className="mt-1 whitespace-pre-line text-ink-soft">{companyAddress}</p>}
            <p className="mt-1 text-ink-soft">
              {[company?.gstin && `GSTIN ${company.gstin}`, company?.phone, company?.email].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-semibold uppercase tracking-wide">Purchase order</h1>
            <p className="mt-1 font-mono text-base">{order.number}</p>
            <div className="mt-2 print:hidden">
              <StatusBadge status={order.status} />
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-6 border-b border-line py-6 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Supplier</p>
            <p className="mt-1 font-medium">{order.supplier.name}</p>
            {supplierAddress && <p className="whitespace-pre-line text-ink-soft">{supplierAddress}</p>}
            {order.supplier.gstin && <p className="text-ink-soft">GSTIN {order.supplier.gstin}</p>}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Deliver to</p>
            <p className="mt-1 font-medium">{order.warehouse.name}</p>
            {order.warehouse.address && <p className="whitespace-pre-line text-ink-soft">{order.warehouse.address}</p>}
          </div>
          <dl className="space-y-1">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-soft">Order date</dt>
              <dd>{formatDate(order.orderDate)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-soft">Expected by</dt>
              <dd>{formatDate(order.expectedDate)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-soft">Payment terms</dt>
              <dd>{order.supplier.paymentTermsDays} days</dd>
            </div>
          </dl>
        </section>

        <table className="mt-6 min-w-full text-sm">
          <thead className="border-b border-line text-xs font-semibold uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="py-2 pr-2 text-left">#</th>
              <th className="py-2 pr-2 text-left">Item</th>
              <th className="py-2 pr-2 text-left">HSN</th>
              <th className="py-2 pr-2 text-right">Qty</th>
              <th className="py-2 pr-2 text-right">Rate</th>
              <th className="py-2 pr-2 text-right">Disc %</th>
              <th className="py-2 pr-2 text-right">GST %</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {order.lines.map((l, i) => (
              <tr key={l.id} className="align-top">
                <td className="py-2 pr-2 text-ink-soft">{i + 1}</td>
                <td className="py-2 pr-2">
                  <div className="font-medium">{l.product.name}</div>
                  <div className="font-mono text-xs text-ink-faint">{l.product.sku}</div>
                  {l.description && <div className="text-xs text-ink-soft">{l.description}</div>}
                </td>
                <td className="py-2 pr-2 font-mono text-xs">{l.product.hsnCode ?? "—"}</td>
                <td className="py-2 pr-2 text-right tabular-nums">
                  {formatNumber(l.quantity)} {l.product.unit}
                </td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatMoney(l.unitPrice)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatNumber(l.discountPct, 2)}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatNumber(l.taxRate, 2)}</td>
                <td className="py-2 text-right tabular-nums">{formatMoney(l.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end border-t border-line pt-4">
          <dl className="w-72 space-y-1">
            <div className="flex justify-between">
              <dt className="text-ink-soft">Subtotal</dt>
              <dd className="tabular-nums">{formatMoney(order.subtotal)}</dd>
            </div>
            {gst.interState ? (
              <div className="flex justify-between">
                <dt className="text-ink-soft">IGST</dt>
                <dd className="tabular-nums">{formatMoney(gst.igst)}</dd>
              </div>
            ) : (
              <>
                <div className="flex justify-between">
                  <dt className="text-ink-soft">CGST</dt>
                  <dd className="tabular-nums">{formatMoney(gst.cgst)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-soft">SGST</dt>
                  <dd className="tabular-nums">{formatMoney(gst.sgst)}</dd>
                </div>
              </>
            )}
            <div className="flex justify-between border-t border-line pt-1 text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatMoney(order.total)}</dd>
            </div>
          </dl>
        </div>

        {order.notes && (
          <section className="mt-6">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Notes</p>
            <p className="mt-1 whitespace-pre-line">{order.notes}</p>
          </section>
        )}

        <footer className="mt-16 flex justify-end">
          <div className="w-56 border-t border-ink pt-2 text-center text-xs text-ink-soft">Authorised signatory</div>
        </footer>
      </article>
    </>
  );
}
