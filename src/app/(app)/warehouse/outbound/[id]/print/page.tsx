import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { PrintButton } from "@/components/ui/print-button";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatNumber, humanize, num } from "@/lib/format";
import { getCompany } from "@/lib/options";
import { QrCode } from "../../../_components/qr-code";
import { WarehouseStatusBadge } from "../../../_components/status";
import { appBaseUrl } from "../../../_lib/qr";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Packing list" };

const cell = "border border-slate-300 px-2 py-1.5";

export default async function PackingListPage({ params }: PageProps<"/warehouse/outbound/[id]/print">) {
  await requireUser("outbound");
  const { id } = await params;
  const [outbound, company, base] = await Promise.all([
    db.outboundOrder.findUnique({
      where: { id },
      include: {
        salesOrder: { select: { number: true, customer: { select: { name: true, gstin: true, shippingAddress: true, billingAddress: true, city: true, state: true, pincode: true, phone: true } } } },
        warehouse: { select: { code: true, name: true, address: true } },
        lines: { orderBy: { product: { name: "asc" } }, include: { product: { select: { sku: true, name: true, unit: true, hsnCode: true } } } },
        handlingUnits: { orderBy: { code: "asc" }, include: { items: { include: { product: { select: { sku: true, name: true, unit: true } } } } } },
      },
    }),
    getCompany(),
    appBaseUrl(),
  ]);
  if (!outbound) notFound();

  const customer = outbound.salesOrder.customer;
  const shipTo = [customer.shippingAddress ?? customer.billingAddress, [customer.city, customer.state, customer.pincode].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join("\n");
  const totalWeight = outbound.handlingUnits.reduce((s, h) => s + num(h.weightKg), 0);

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={`Packing list ${outbound.number}`}
          back={{ href: `/warehouse/outbound/${id}`, label: outbound.number }}
          actions={<PrintButton>Print packing list</PrintButton>}
        />
      </div>

      <article className="mx-auto max-w-4xl rounded-lg border border-line bg-white p-8 text-sm text-ink shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
          <div>
            <p className="text-lg font-semibold">{company.legalName ?? company.name}</p>
            <p className="mt-1 text-ink-soft">
              Ship from {outbound.warehouse.code} — {outbound.warehouse.name}
            </p>
            {outbound.warehouse.address && <p className="whitespace-pre-line text-ink-soft">{outbound.warehouse.address}</p>}
            {company.gstin && <p className="text-ink-soft">GSTIN {company.gstin}</p>}
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-semibold uppercase tracking-wide">Packing list</h1>
            <p className="mt-1 font-mono text-base">{outbound.number}</p>
            <div className="mt-2 print:hidden">
              <WarehouseStatusBadge status={outbound.status} />
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-6 border-b border-line py-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Ship to</p>
            <p className="mt-1 font-medium">{customer.name}</p>
            {shipTo && <p className="whitespace-pre-line text-ink-soft">{shipTo}</p>}
            {customer.phone && <p className="text-ink-soft">{customer.phone}</p>}
            {customer.gstin && <p className="text-ink-soft">GSTIN {customer.gstin}</p>}
          </div>
          <dl className="space-y-1">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-soft">Sales order</dt>
              <dd>{outbound.salesOrder.number}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-soft">Packed on</dt>
              <dd>{formatDate(outbound.packedAt ?? outbound.createdAt)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-soft">Handling units</dt>
              <dd>{outbound.handlingUnits.length}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-soft">Gross weight</dt>
              <dd>{totalWeight > 0 ? `${formatNumber(totalWeight)} kg` : "—"}</dd>
            </div>
          </dl>
        </section>

        <h2 className="mt-6 text-xs font-semibold uppercase tracking-wide text-ink-faint">Summary</h2>
        <table className="mt-2 w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 text-left">
              <th className={cell}>#</th>
              <th className={cell}>Item</th>
              <th className={cell}>HSN</th>
              <th className={`${cell} text-right`}>Ordered</th>
              <th className={`${cell} text-right`}>Packed</th>
            </tr>
          </thead>
          <tbody>
            {outbound.lines.map((l, i) => (
              <tr key={l.id}>
                <td className={cell}>{i + 1}</td>
                <td className={cell}>
                  {l.product.name} <span className="font-mono text-[10px] text-slate-500">{l.product.sku}</span>
                </td>
                <td className={cell}>{l.product.hsnCode ?? "—"}</td>
                <td className={`${cell} text-right tabular-nums`}>{formatNumber(l.quantity)}</td>
                <td className={`${cell} text-right tabular-nums`}>
                  {formatNumber(l.packedQty)} {l.product.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="mt-6 text-xs font-semibold uppercase tracking-wide text-ink-faint">Handling units</h2>
        <div className="mt-2 space-y-3">
          {outbound.handlingUnits.length === 0 && <p className="text-ink-faint">Nothing packed yet.</p>}
          {outbound.handlingUnits.map((hu, i) => (
            <section key={hu.id} className="flex break-inside-avoid gap-4 rounded border border-slate-300 p-3">
              <QrCode value={`${base}/warehouse/outbound/${id}?hu=${encodeURIComponent(hu.code)}`} size={96} label={`QR code for ${hu.code}`} />
              <div className="min-w-0 flex-1">
                <p className="font-mono font-semibold">
                  {hu.code}{" "}
                  <span className="font-sans text-xs font-normal text-slate-500">
                    ({i + 1} of {outbound.handlingUnits.length}) · {humanize(hu.type)}
                    {hu.weightKg !== null && ` · ${formatNumber(hu.weightKg)} kg`}
                    {hu.dimensions && ` · ${hu.dimensions}`}
                  </span>
                </p>
                <table className="mt-1 w-full text-xs">
                  <tbody>
                    {hu.items.map((item) => (
                      <tr key={item.id} className="border-t border-slate-200">
                        <td className="py-1">
                          {item.product.name} <span className="font-mono text-[10px] text-slate-500">{item.product.sku}</span>
                        </td>
                        <td className="py-1 text-right tabular-nums">
                          {formatNumber(item.quantity)} {item.product.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>

        <section className="mt-10 grid grid-cols-2 gap-6 text-xs text-ink-soft">
          <div className="border-t border-slate-400 pt-2">Packed by</div>
          <div className="border-t border-slate-400 pt-2">Received by (customer)</div>
        </section>
      </article>
    </>
  );
}
