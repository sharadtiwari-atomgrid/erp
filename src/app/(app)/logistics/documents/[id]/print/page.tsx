import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/ui/print-button";
import { requireUser } from "@/lib/auth";
import { formatDate, formatDateTime, formatNumber, humanize, num } from "@/lib/format";
import { getCompany } from "@/lib/options";
import { loadShippingDocument } from "../../load";

export const metadata: Metadata = { title: "Print shipping document" };

const cell = "border border-slate-300 px-2 py-1.5";

export default async function PrintShippingDocumentPage({ params }: PageProps<"/logistics/documents/[id]/print">) {
  await requireUser("trips");
  const { id } = await params;
  const [doc, company] = await Promise.all([loadShippingDocument(id), getCompany()]);
  if (!doc) notFound();
  const { customer, outbound, trip } = doc;
  const totalWeight = outbound?.handlingUnits.reduce((s, h) => s + num(h.weightKg), 0) ?? 0;

  const meta: Array<[string, string]> = [
    [doc.type === "ASN" ? "ASN no." : "DN no.", doc.number],
    ["Date", formatDate(doc.issuedAt)],
    ...(outbound ? ([["Outbound", outbound.number], ["Order ref.", outbound.salesOrder.number]] as Array<[string, string]>) : []),
    ...(trip ? ([["Trip", trip.number]] as Array<[string, string]>) : []),
    ...(doc.expectedDelivery ? ([["Expected delivery", formatDateTime(doc.expectedDelivery)]] as Array<[string, string]>) : []),
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <style>{"@page { size: A4; margin: 12mm; }"}</style>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={`/logistics/documents/${id}`} className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink">
          <span aria-hidden>←</span> Back
        </Link>
        <PrintButton />
      </div>

      <article className="rounded-lg border border-line bg-white p-8 text-sm text-slate-900 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-slate-800 pb-4">
          <div className="max-w-sm">
            <p className="text-xl font-bold">{company.name}</p>
            {company.address && <p className="mt-1 whitespace-pre-line text-xs">{company.address}</p>}
            <p className="text-xs">{[company.city, company.state, company.pincode].filter(Boolean).join(", ")}</p>
            {company.gstin && <p className="mt-1 text-xs font-semibold">GSTIN: <span className="font-mono">{company.gstin}</span></p>}
          </div>
          <div className="text-right">
            <p className="text-lg font-bold uppercase tracking-wide">{doc.type === "ASN" ? "Advance shipping notice" : "Delivery note"}</p>
            <dl className="mt-2 space-y-0.5 text-xs">
              {meta.map(([label, value]) => (
                <div key={label} className="flex justify-end gap-3">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="min-w-28 font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-6 border-b border-slate-300 py-4 text-xs">
          <div>
            <p className="font-semibold uppercase tracking-wide text-slate-500">Ship to</p>
            {customer ? (
              <>
                <p className="mt-1 text-sm font-semibold">{customer.name}</p>
                {(customer.shippingAddress ?? customer.billingAddress) && <p className="whitespace-pre-line">{customer.shippingAddress ?? customer.billingAddress}</p>}
                <p>{[customer.city, customer.state, customer.pincode].filter(Boolean).join(", ")}</p>
                {customer.phone && <p>{customer.phone}</p>}
                {customer.gstin && <p className="mt-1">GSTIN: <span className="font-mono">{customer.gstin}</span></p>}
              </>
            ) : (
              <p className="mt-1">—</p>
            )}
          </div>
          <div className="text-right">
            <p className="font-semibold uppercase tracking-wide text-slate-500">Transport</p>
            {trip ? (
              <>
                <p className="mt-1 text-sm font-medium">
                  {trip.vehicle.registrationNo} · {trip.vehicle.type}
                </p>
                {trip.vehicle.transporter && <p>{trip.vehicle.transporter.name}</p>}
                {trip.driver && <p>Driver: {[trip.driver.name, trip.driver.phone].filter(Boolean).join(" · ")}</p>}
                <p>
                  {trip.origin} → {trip.destination}
                </p>
              </>
            ) : (
              <p className="mt-1">—</p>
            )}
            {outbound && <p className="mt-1">Dispatched from {outbound.warehouse.name}</p>}
          </div>
        </section>

        <table className="mt-4 w-full border-collapse text-xs">
          <thead className="bg-slate-100">
            <tr>
              <th className={`${cell} w-8 text-left`}>#</th>
              <th className={`${cell} text-left`}>Item</th>
              <th className={`${cell} text-left`}>HSN</th>
              <th className={`${cell} text-right`}>Quantity</th>
              {doc.type === "DN" && <th className={`${cell} w-28 text-right`}>Received</th>}
            </tr>
          </thead>
          <tbody>
            {outbound?.lines.map((l, i) => (
              <tr key={l.id} className="break-inside-avoid">
                <td className={cell}>{i + 1}</td>
                <td className={cell}>
                  <p className="font-medium">{l.product.name}</p>
                  <p className="font-mono text-slate-500">{l.product.sku}</p>
                </td>
                <td className={`${cell} font-mono`}>{l.product.hsnCode ?? "—"}</td>
                <td className={`${cell} text-right tabular-nums`}>
                  {formatNumber(num(l.packedQty) > 0 ? l.packedQty : l.quantity)} {l.product.unit}
                </td>
                {doc.type === "DN" && <td className={cell} />}
              </tr>
            ))}
          </tbody>
        </table>

        {outbound && outbound.handlingUnits.length > 0 && (
          <table className="mt-6 w-full border-collapse break-inside-avoid text-xs">
            <thead className="bg-slate-100">
              <tr>
                <th className={`${cell} text-left`}>Package</th>
                <th className={`${cell} text-left`}>Type</th>
                <th className={`${cell} text-left`}>Contents</th>
                <th className={`${cell} text-right`}>Weight</th>
              </tr>
            </thead>
            <tbody>
              {outbound.handlingUnits.map((hu) => (
                <tr key={hu.id}>
                  <td className={`${cell} font-mono`}>{hu.code}</td>
                  <td className={cell}>
                    {humanize(hu.type)}
                    {hu.dimensions ? ` · ${hu.dimensions}` : ""}
                  </td>
                  <td className={cell}>{hu.items.map((i) => `${i.product.name} × ${formatNumber(i.quantity)} ${i.product.unit}`).join(", ") || "—"}</td>
                  <td className={`${cell} text-right tabular-nums`}>{hu.weightKg ? `${formatNumber(hu.weightKg, 2)} kg` : "—"}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className={cell} colSpan={3}>
                  {outbound.handlingUnits.length} package{outbound.handlingUnits.length === 1 ? "" : "s"}
                </td>
                <td className={`${cell} text-right tabular-nums`}>{totalWeight > 0 ? `${formatNumber(totalWeight, 2)} kg` : "—"}</td>
              </tr>
            </tbody>
          </table>
        )}

        {doc.notes && (
          <p className="mt-6 whitespace-pre-line text-xs">
            <span className="font-semibold uppercase tracking-wide text-slate-500">Notes: </span>
            {doc.notes}
          </p>
        )}

        <footer className="mt-12 grid grid-cols-2 gap-10 break-inside-avoid text-xs">
          {doc.type === "DN" ? (
            <>
              <div>
                <p>Received the above goods in good condition.</p>
                <p className="mt-10 border-t border-slate-400 pt-1">
                  Receiver’s name & signature{doc.receivedBy ? `: ${doc.receivedBy}` : ""}
                  {doc.deliveredAt ? ` · ${formatDateTime(doc.deliveredAt)}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p>For {company.legalName ?? company.name}</p>
                <p className="mt-10 border-t border-slate-400 pt-1">Authorised signatory</p>
              </div>
            </>
          ) : (
            <div className="col-span-2 text-right">
              <p>For {company.legalName ?? company.name}</p>
              <p className="mt-10 inline-block border-t border-slate-400 pt-1">Authorised signatory</p>
            </div>
          )}
        </footer>
      </article>
    </div>
  );
}
