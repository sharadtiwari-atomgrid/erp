import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { PrintButton } from "@/components/ui/print-button";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatNumber, humanize } from "@/lib/format";
import { appOrigin, QrCode } from "../../../_components/qr-code";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Batch label" };

/** Printable batch label; the QR code opens the batch page. */
export default async function BatchLabelPage({ params }: PageProps<"/manufacturing/batches/[id]/label">) {
  await requireUser("production");
  const { id } = await params;
  const batch = await db.productionBatch.findUnique({
    where: { id },
    include: { productionOrder: { select: { number: true, product: { select: { sku: true, name: true, unit: true } }, warehouse: { select: { code: true } } } } },
  });
  if (!batch) notFound();
  const url = `${await appOrigin()}/manufacturing/batches/${batch.id}`;
  const order = batch.productionOrder;

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={`Label for ${batch.number}`}
          back={{ href: `/manufacturing/batches/${id}`, label: batch.number }}
          actions={<PrintButton>Print label</PrintButton>}
        />
      </div>
      <article className="mx-auto flex w-[100mm] items-center gap-4 rounded-lg border border-line bg-white p-4 text-ink shadow-sm print:mx-0 print:rounded-none print:border-ink print:shadow-none">
        <QrCode value={url} size={128} className="shrink-0" />
        <div className="min-w-0 text-sm">
          <p className="font-mono text-lg font-semibold">{batch.number}</p>
          <p className="font-medium">{order.product.name}</p>
          <p className="font-mono text-xs text-ink-soft">{order.product.sku}</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 text-xs">
            <dt className="text-ink-soft">Qty</dt>
            <dd className="tabular-nums">
              {formatNumber(batch.quantity)} {order.product.unit}
              {batch.status === "PASSED" || batch.status === "PARTIALLY_PASSED" ? ` (passed ${formatNumber(batch.passedQty)})` : ""}
            </dd>
            <dt className="text-ink-soft">Order</dt>
            <dd>{order.number}</dd>
            <dt className="text-ink-soft">Store</dt>
            <dd>{order.warehouse.code}</dd>
            <dt className="text-ink-soft">Date</dt>
            <dd>{formatDate(batch.qcAt ?? batch.completedAt ?? batch.createdAt)}</dd>
            <dt className="text-ink-soft">Status</dt>
            <dd>{humanize(batch.status)}</dd>
          </dl>
        </div>
      </article>
      <p className="mt-3 text-center text-xs break-all text-ink-faint print:hidden">{url}</p>
    </>
  );
}
