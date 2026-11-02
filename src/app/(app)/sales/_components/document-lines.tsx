import Link from "next/link";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatMoney, formatNumber, num } from "@/lib/format";

type Numeric = number | string | { toString(): string };

export type DocumentLine = {
  id: string;
  description: string | null;
  quantity: Numeric;
  unitPrice: Numeric;
  discountPct: Numeric;
  taxRate: Numeric;
  taxAmount: Numeric;
  lineTotal: Numeric;
  product: { id: string; sku: string; name: string; unit: string };
};

export function ProductCell({ line }: { line: Pick<DocumentLine, "description" | "product"> }) {
  return (
    <>
      <Link href={`/inventory/products/${line.product.id}`} className="font-medium text-brand-700 hover:underline">
        {line.product.name}
      </Link>
      <div className="font-mono text-xs text-ink-faint">{line.product.sku}</div>
      {line.description && <div className="text-xs text-ink-soft">{line.description}</div>}
    </>
  );
}

/** Read-only line items table for quotation and invoice detail pages. */
export function DocumentLines({ lines }: { lines: DocumentLine[] }) {
  return (
    <Table>
      <THead>
        <tr>
          <TH>Product</TH>
          <TH align="right">Qty</TH>
          <TH align="right">Unit price</TH>
          <TH align="right">Disc %</TH>
          <TH align="right">GST %</TH>
          <TH align="right">GST</TH>
          <TH align="right">Amount</TH>
        </tr>
      </THead>
      <TBody>
        {lines.length === 0 && <EmptyRow colSpan={7}>No line items.</EmptyRow>}
        {lines.map((l) => (
          <TR key={l.id}>
            <TD>
              <ProductCell line={l} />
            </TD>
            <TD align="right">
              {formatNumber(l.quantity)} <span className="text-xs text-ink-faint">{l.product.unit}</span>
            </TD>
            <TD align="right">{formatMoney(l.unitPrice)}</TD>
            <TD align="right">{num(l.discountPct) > 0 ? formatNumber(l.discountPct, 2) : "—"}</TD>
            <TD align="right">{formatNumber(l.taxRate, 2)}</TD>
            <TD align="right">{formatMoney(l.taxAmount)}</TD>
            <TD align="right">{formatMoney(l.lineTotal)}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

/** Subtotal / GST / total summary shown under a lines table. */
export function DocumentTotals({
  subtotal,
  taxTotal,
  total,
  extra,
}: {
  subtotal: Numeric;
  taxTotal: Numeric;
  total: Numeric;
  extra?: Array<{ label: string; value: Numeric; strong?: boolean }>;
}) {
  return (
    <div className="flex justify-end border-t border-line px-5 py-4">
      <dl className="w-72 space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-soft">Subtotal</dt>
          <dd className="tabular-nums">{formatMoney(subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-soft">GST</dt>
          <dd className="tabular-nums">{formatMoney(taxTotal)}</dd>
        </div>
        <div className="flex justify-between border-t border-line pt-1 font-semibold">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatMoney(total)}</dd>
        </div>
        {extra?.map((row) => (
          <div key={row.label} className={row.strong ? "flex justify-between font-semibold" : "flex justify-between"}>
            <dt className={row.strong ? undefined : "text-ink-soft"}>{row.label}</dt>
            <dd className="tabular-nums">{formatMoney(row.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
