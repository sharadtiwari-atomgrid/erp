import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { PrintButton } from "@/components/ui/print-button";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatDateTime, formatMoney, formatNumber, humanize, num } from "@/lib/format";
import { getCompany } from "@/lib/options";
import { QrCode } from "../../../_components/qr-code";
import { WarehouseStatusBadge } from "../../../_components/status";
import { absoluteUrl } from "../../../_lib/qr";

export const metadata: Metadata = { title: "Print GRN" };

const cell = "border border-slate-300 px-2 py-1.5";

export default async function PrintInboundPage({ params }: PageProps<"/warehouse/inbound/[id]/print">) {
  await requireUser("inbound");
  const { id } = await params;
  const [receipt, company] = await Promise.all([
    db.inboundReceipt.findUnique({
      where: { id },
      include: {
        supplier: { select: { name: true, gstin: true, city: true, state: true } },
        purchaseOrder: { select: { number: true } },
        warehouse: { select: { code: true, name: true, address: true } },
        lines: {
          orderBy: { product: { name: "asc" } },
          include: { product: { select: { sku: true, name: true, unit: true, hsnCode: true } }, bin: { select: { code: true } } },
        },
      },
    }),
    getCompany(),
  ]);
  if (!receipt) notFound();

  const pending = receipt.status === "QC_PENDING";
  const accepted = receipt.lines.reduce((s, l) => s + num(l.acceptedQty), 0);
  const qcPassed = receipt.status === "COMPLETED" && accepted > 0;
  const url = await absoluteUrl(`/warehouse/inbound/${id}`);

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title={`Print ${receipt.number}`}
          description={qcPassed ? "GRN with QR label." : "The QR label is available once QC has passed."}
          back={{ href: `/warehouse/inbound/${id}`, label: receipt.number }}
          actions={<PrintButton>Print</PrintButton>}
        />
      </div>

      <article className="mx-auto max-w-4xl rounded-lg border border-line bg-white p-8 text-sm text-ink shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
          <div>
            <p className="text-lg font-semibold">{company.legalName ?? company.name}</p>
            <p className="mt-1 text-ink-soft">{[company.city, company.state].filter(Boolean).join(", ")}</p>
            {company.gstin && <p className="text-ink-soft">GSTIN {company.gstin}</p>}
          </div>
          <div className="text-right">
            <h1 className="text-2xl font-semibold uppercase tracking-wide">Goods receipt note</h1>
            <p className="mt-1 font-mono text-base">{receipt.number}</p>
            <div className="mt-2 print:hidden">
              <WarehouseStatusBadge status={receipt.status} />
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-6 border-b border-line py-6 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Supplier</p>
            <p className="mt-1 font-medium">{receipt.supplier?.name ?? "—"}</p>
            {receipt.supplier && <p className="text-ink-soft">{[receipt.supplier.city, receipt.supplier.state].filter(Boolean).join(", ")}</p>}
            {receipt.supplier?.gstin && <p className="text-ink-soft">GSTIN {receipt.supplier.gstin}</p>}
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">Received at</p>
            <p className="mt-1 font-medium">
              {receipt.warehouse.code} — {receipt.warehouse.name}
            </p>
            {receipt.warehouse.address && <p className="whitespace-pre-line text-ink-soft">{receipt.warehouse.address}</p>}
          </div>
          <dl className="space-y-1">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-soft">Date</dt>
              <dd>{formatDate(receipt.receivedAt)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-soft">PO</dt>
              <dd>{receipt.purchaseOrder?.number ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-soft">Supplier invoice</dt>
              <dd>{receipt.supplierInvoice ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-soft">Vehicle</dt>
              <dd className="font-mono">{receipt.vehicleNo ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-soft">QC</dt>
              <dd>{receipt.qcCompletedAt ? formatDateTime(receipt.qcCompletedAt) : humanize(receipt.status)}</dd>
            </div>
          </dl>
        </section>

        <table className="mt-6 w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 text-left">
              <th className={cell}>#</th>
              <th className={cell}>Item</th>
              <th className={cell}>HSN</th>
              <th className={`${cell} text-right`}>Received</th>
              <th className={`${cell} text-right`}>Accepted</th>
              <th className={`${cell} text-right`}>Rejected</th>
              <th className={`${cell} text-right`}>Unit cost</th>
              <th className={cell}>Bin</th>
              <th className={cell}>QC notes</th>
            </tr>
          </thead>
          <tbody>
            {receipt.lines.map((l, i) => (
              <tr key={l.id}>
                <td className={cell}>{i + 1}</td>
                <td className={cell}>
                  {l.product.name}
                  <div className="font-mono text-[10px] text-slate-500">{l.product.sku}</div>
                </td>
                <td className={cell}>{l.product.hsnCode ?? "—"}</td>
                <td className={`${cell} text-right tabular-nums`}>
                  {formatNumber(l.receivedQty)} {l.product.unit}
                </td>
                <td className={`${cell} text-right tabular-nums`}>{pending ? "" : formatNumber(l.acceptedQty)}</td>
                <td className={`${cell} text-right tabular-nums`}>{pending ? "" : formatNumber(l.rejectedQty)}</td>
                <td className={`${cell} text-right tabular-nums`}>{formatMoney(l.unitCost)}</td>
                <td className={`${cell} font-mono`}>{l.bin?.code ?? ""}</td>
                <td className={cell}>{l.qcNotes ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="mt-10 grid grid-cols-3 gap-6 text-xs text-ink-soft">
          <div className="border-t border-slate-400 pt-2">Received by</div>
          <div className="border-t border-slate-400 pt-2">QC inspector</div>
          <div className="border-t border-slate-400 pt-2">Store in-charge</div>
        </section>
      </article>

      {qcPassed && (
        <article className="mx-auto mt-8 flex max-w-md break-before-page items-center gap-5 rounded-lg border-2 border-dashed border-slate-400 bg-white p-5 text-ink print:mt-0">
          <QrCode value={url} size={150} label={`QR code for ${receipt.number}`} />
          <div className="min-w-0 space-y-1 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">GRN · QC passed</p>
            <p className="font-mono text-xl font-semibold">{receipt.number}</p>
            <p>{receipt.supplier?.name ?? "—"}</p>
            <p className="text-slate-600">
              {receipt.warehouse.code} · {formatDate(receipt.qcCompletedAt ?? receipt.receivedAt)}
            </p>
            <p className="text-slate-600">
              {formatNumber(accepted)} units accepted · {receipt.lines.length} item{receipt.lines.length === 1 ? "" : "s"}
            </p>
            <p className="break-all text-[10px] text-slate-400">{url}</p>
          </div>
        </article>
      )}
    </>
  );
}
