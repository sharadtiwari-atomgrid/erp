"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { formatMoney } from "@/lib/format";
import { computeDocument, computeLine, type LineInput } from "@/lib/totals";

export type ProductOption = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  salePrice: number;
  purchasePrice: number;
  taxRate: number;
};

type Row = {
  key: number;
  productId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPct: string;
  taxRate: string;
};

let nextKey = 1;

function toRow(line?: Partial<LineInput>): Row {
  return {
    key: nextKey++,
    productId: line?.productId ?? "",
    description: line?.description ?? "",
    quantity: String(line?.quantity ?? 1),
    unitPrice: String(line?.unitPrice ?? 0),
    discountPct: String(line?.discountPct ?? 0),
    taxRate: String(line?.taxRate ?? 0),
  };
}

function toLine(row: Row): LineInput {
  return {
    productId: row.productId,
    description: row.description || null,
    quantity: Number(row.quantity) || 0,
    unitPrice: Number(row.unitPrice) || 0,
    discountPct: Number(row.discountPct) || 0,
    taxRate: Number(row.taxRate) || 0,
  };
}

/**
 * Editable table of document lines (quotations, sales orders, invoices,
 * purchase orders). Submits the lines as JSON in a hidden input named `name`;
 * read it on the server with `parseLines(formData)`.
 */
export function LineItemsEditor({
  products,
  priceField,
  initialLines,
  name = "lines",
  currency = "INR",
}: {
  products: ProductOption[];
  /** Which product price to pre-fill when a product is picked. */
  priceField: "salePrice" | "purchasePrice";
  initialLines?: LineInput[];
  name?: string;
  currency?: string;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    initialLines && initialLines.length > 0 ? initialLines.map(toRow) : [toRow()],
  );
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const lines = rows.map(toLine);
  const totals = computeDocument(lines.filter((l) => l.productId));

  function update(key: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function pickProduct(key: number, productId: string) {
    const p = productById.get(productId);
    update(key, {
      productId,
      ...(p ? { unitPrice: String(p[priceField]), taxRate: String(p.taxRate) } : {}),
    });
  }

  return (
    <div>
      <input type="hidden" name={name} value={JSON.stringify(lines.filter((l) => l.productId))} />
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="min-w-full divide-y divide-line text-sm">
          <thead className="bg-muted/60 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            <tr>
              <th className="px-3 py-2 text-left">Product</th>
              <th className="w-24 px-3 py-2 text-right">Qty</th>
              <th className="w-32 px-3 py-2 text-right">Unit price</th>
              <th className="w-24 px-3 py-2 text-right">Disc %</th>
              <th className="w-24 px-3 py-2 text-right">GST %</th>
              <th className="w-32 px-3 py-2 text-right">Amount</th>
              <th className="w-10 px-2 py-2" aria-label="Remove" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row) => {
              const p = productById.get(row.productId);
              const { lineTotal } = computeLine(toLine(row));
              return (
                <tr key={row.key} className="align-top">
                  <td className="min-w-64 px-3 py-2">
                    <Select
                      value={row.productId}
                      onChange={(e) => pickProduct(row.key, e.target.value)}
                      aria-label="Product"
                    >
                      <option value="">Select a product…</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} — {p.name}
                        </option>
                      ))}
                    </Select>
                    <Input
                      className="mt-1.5 h-8 text-xs"
                      placeholder="Description (optional)"
                      value={row.description}
                      onChange={(e) => update(row.key, { description: e.target.value })}
                      aria-label="Description"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      className="text-right"
                      value={row.quantity}
                      onChange={(e) => update(row.key, { quantity: e.target.value })}
                      aria-label="Quantity"
                    />
                    {p && <p className="mt-1 text-right text-xs text-ink-faint">{p.unit}</p>}
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="text-right"
                      value={row.unitPrice}
                      onChange={(e) => update(row.key, { unitPrice: e.target.value })}
                      aria-label="Unit price"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      className="text-right"
                      value={row.discountPct}
                      onChange={(e) => update(row.key, { discountPct: e.target.value })}
                      aria-label="Discount percent"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      className="text-right"
                      value={row.taxRate}
                      onChange={(e) => update(row.key, { taxRate: e.target.value })}
                      aria-label="GST percent"
                    />
                  </td>
                  <td className="px-3 py-2 pt-4 text-right tabular-nums">{formatMoney(lineTotal, currency)}</td>
                  <td className="px-2 py-2 pt-3 text-center">
                    <button
                      type="button"
                      onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== row.key) : rs))}
                      className="rounded p-1 text-ink-faint hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                      disabled={rows.length === 1}
                      aria-label="Remove line"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <Button variant="secondary" size="sm" onClick={() => setRows((rs) => [...rs, toRow()])}>
          + Add line
        </Button>
        <dl className="w-64 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-soft">Subtotal</dt>
            <dd className="tabular-nums">{formatMoney(totals.subtotal, currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-soft">GST</dt>
            <dd className="tabular-nums">{formatMoney(totals.taxTotal, currency)}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-1 font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatMoney(totals.total, currency)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
