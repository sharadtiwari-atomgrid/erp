import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { PrintButton } from "@/components/ui/print-button";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatNumber, humanize } from "@/lib/format";
import { QrCode } from "../../../_components/qr-code";
import { appBaseUrl } from "../../../_lib/qr";

export const metadata: Metadata = { title: "Handling unit labels" };

/** One printable QR label per handling unit (one per page when printed). */
export default async function HandlingUnitLabelsPage({ params }: PageProps<"/warehouse/outbound/[id]/labels">) {
  await requireUser("outbound");
  const { id } = await params;
  const [outbound, base] = await Promise.all([
    db.outboundOrder.findUnique({
      where: { id },
      include: {
        salesOrder: { select: { number: true, customer: { select: { name: true, city: true, state: true, pincode: true } } } },
        warehouse: { select: { code: true } },
        handlingUnits: { orderBy: { code: "asc" }, include: { items: { include: { product: { select: { sku: true, unit: true } } } } } },
      },
    }),
    appBaseUrl(),
  ]);
  if (!outbound) notFound();
  const customer = outbound.salesOrder.customer;
  const n = outbound.handlingUnits.length;

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={`Labels for ${outbound.number}`}
          description={`${n} handling unit${n === 1 ? "" : "s"}`}
          back={{ href: `/warehouse/outbound/${id}`, label: outbound.number }}
          actions={<PrintButton>Print labels</PrintButton>}
        />
      </div>
      {n === 0 && <p className="text-sm text-ink-faint">No handling units yet.</p>}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 print:block">
        {outbound.handlingUnits.map((hu, i) => (
          <article
            key={hu.id}
            className="flex break-inside-avoid items-start gap-4 rounded-lg border-2 border-dashed border-slate-400 bg-white p-5 text-ink print:mb-0 print:break-after-page print:border-solid"
          >
            <QrCode value={`${base}/warehouse/outbound/${id}?hu=${encodeURIComponent(hu.code)}`} size={150} label={`QR code for ${hu.code}`} />
            <div className="min-w-0 space-y-1 text-sm">
              <p className="font-mono text-xl font-semibold">{hu.code}</p>
              <p className="text-xs uppercase tracking-wide text-slate-500">
                {humanize(hu.type)} {i + 1} of {n}
                {hu.weightKg !== null && ` · ${formatNumber(hu.weightKg)} kg`}
              </p>
              <p className="font-medium">{customer.name}</p>
              <p className="text-slate-600">{[customer.city, customer.state, customer.pincode].filter(Boolean).join(", ")}</p>
              <p className="text-slate-600">
                {outbound.number} · {outbound.salesOrder.number} · {outbound.warehouse.code}
              </p>
              <p className="text-xs text-slate-500">
                {hu.items.map((item) => `${formatNumber(item.quantity)} ${item.product.unit} ${item.product.sku}`).join(", ")}
              </p>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
