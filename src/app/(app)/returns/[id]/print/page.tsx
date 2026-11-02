import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/ui/print-button";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney, formatNumber, humanize, num } from "@/lib/format";
import { getCompany } from "@/lib/options";

export const metadata: Metadata = { title: "Print return" };

const cell = "border border-slate-300 px-2 py-1.5";

export default async function PrintReturnPage({ params }: PageProps<"/returns/[id]/print">) {
  await requireUser("returns");
  const { id } = await params;
  const [ret, company] = await Promise.all([
    db.returnOrder.findUnique({
      where: { id },
      include: {
        customer: true,
        invoice: { select: { number: true } },
        salesOrder: { select: { number: true } },
        warehouse: { select: { name: true, address: true } },
        lines: { orderBy: { id: "asc" }, include: { product: { select: { sku: true, name: true, unit: true, hsnCode: true } } } },
      },
    }),
    getCompany(),
  ]);
  if (!ret) notFound();
  const { customer } = ret;
  const received = ret.status !== "REQUESTED" && ret.status !== "CANCELLED";

  const meta: Array<[string, string]> = [
    ["RMA no.", ret.number],
    ["Date", formatDate(ret.requestedAt)],
    ["Status", humanize(ret.status)],
  ];
  if (ret.invoice) meta.push(["Invoice ref.", ret.invoice.number]);
  if (ret.salesOrder) meta.push(["Order ref.", ret.salesOrder.number]);

  return (
    <div className="mx-auto max-w-4xl">
      <style>{"@page { size: A4; margin: 12mm; }"}</style>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={`/returns/${id}`} className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink">
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
            {company.gstin && (
              <p className="mt-1 text-xs font-semibold">
                GSTIN: <span className="font-mono">{company.gstin}</span>
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-lg font-bold uppercase tracking-wide">Return authorisation</p>
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
            <p className="font-semibold uppercase tracking-wide text-slate-500">Customer</p>
            <p className="mt-1 text-sm font-semibold">{customer.name}</p>
            {customer.billingAddress && <p className="whitespace-pre-line">{customer.billingAddress}</p>}
            <p>{[customer.city, customer.state, customer.pincode].filter(Boolean).join(", ")}</p>
            {customer.gstin && (
              <p className="mt-1">
                GSTIN: <span className="font-mono">{customer.gstin}</span>
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="font-semibold uppercase tracking-wide text-slate-500">Return to</p>
            <p className="mt-1 text-sm font-medium">{ret.warehouse.name}</p>
            {ret.warehouse.address && <p className="whitespace-pre-line">{ret.warehouse.address}</p>}
            {ret.reason && <p className="mt-2">Reason: {ret.reason}</p>}
          </div>
        </section>

        <table className="mt-4 w-full border-collapse text-xs">
          <thead className="bg-slate-100">
            <tr>
              <th className={`${cell} w-8 text-left`}>#</th>
              <th className={`${cell} text-left`}>Item</th>
              <th className={`${cell} text-left`}>HSN</th>
              <th className={`${cell} text-right`}>Requested</th>
              <th className={`${cell} text-right`}>Received</th>
              <th className={`${cell} text-left`}>Disposition</th>
              <th className={`${cell} text-left`}>QC notes</th>
            </tr>
          </thead>
          <tbody>
            {ret.lines.map((l, i) => (
              <tr key={l.id} className="break-inside-avoid align-top">
                <td className={cell}>{i + 1}</td>
                <td className={cell}>
                  <p className="font-medium">{l.product.name}</p>
                  <p className="font-mono text-slate-500">{l.product.sku}</p>
                </td>
                <td className={`${cell} font-mono`}>{l.product.hsnCode ?? "—"}</td>
                <td className={`${cell} text-right tabular-nums`}>
                  {formatNumber(l.quantity)} {l.product.unit}
                </td>
                <td className={`${cell} text-right tabular-nums`}>{received ? formatNumber(l.receivedQty) : ""}</td>
                <td className={cell}>{l.disposition === "PENDING" ? "" : `${humanize(l.disposition)}${l.repairedAt ? " (repaired)" : ""}`}</td>
                <td className={cell}>{l.qcNotes ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {num(ret.creditAmount) > 0 && (
          <p className="mt-4 text-right text-sm">
            Credit amount: <span className="font-bold tabular-nums">{formatMoney(ret.creditAmount)}</span>
          </p>
        )}
        {ret.notes && <p className="mt-4 whitespace-pre-line text-xs">Notes: {ret.notes}</p>}

        <footer className="mt-12 grid grid-cols-2 gap-10 break-inside-avoid text-xs">
          <div>
            <p className="mt-10 border-t border-slate-400 pt-1">Received by (warehouse)</p>
          </div>
          <div className="text-right">
            <p>For {company.legalName ?? company.name}</p>
            <p className="mt-10 border-t border-slate-400 pt-1">Authorised signatory</p>
          </div>
        </footer>
      </article>
    </div>
  );
}
