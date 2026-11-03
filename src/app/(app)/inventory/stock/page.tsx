import Link from "next/link";
import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { ListToolbar, Pagination } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney, formatNumber, num } from "@/lib/format";
import { pagination, param } from "@/lib/forms";
import { can } from "@/lib/permissions";
import type { Prisma } from "@/generated/prisma/client";
import { getStockBreakdown, isLowStock, type StockBreakdown } from "../_components/stock";
import { OnHand } from "../_components/stock-badge";
import { branchWhere } from "@/lib/branch";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Stock management" };

export default async function StockPage({ searchParams }: PageProps<"/inventory/stock">) {
  const user = await requireUser("stock");
  const sp = await searchParams;
  const q = param(sp, "q");
  const warehouseId = param(sp, "warehouse");
  const lowOnly = param(sp, "low") === "1";
  const { page, take, skip } = pagination(sp);

  const where: Prisma.ProductWhereInput = {
    type: "GOODS",
    isActive: true,
    ...(q && {
      OR: [
        { sku: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ],
    }),
  };

  const [products, allWarehouses] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true, unit: true, type: true, purchasePrice: true, reorderLevel: true },
    }),
    db.warehouse.findMany({ where: await branchWhere(), orderBy: { name: "asc" }, select: { id: true, code: true, name: true, isActive: true } }),
  ]);
  const breakdown = await getStockBreakdown({ productIds: products.map((p) => p.id), warehouseIds: allWarehouses.map((w) => w.id) });

  const warehouseById = new Map(allWarehouses.map((w) => [w.id, w]));
  const byProduct = new Map<string, StockBreakdown[]>();
  for (const b of breakdown) byProduct.set(b.productId, [...(byProduct.get(b.productId) ?? []), b]);

  type Row = StockBreakdown & {
    key: string;
    product: (typeof products)[number];
    warehouse: (typeof allWarehouses)[number] | null;
    purchasePrice: number;
    reorderLevel: number;
    low: boolean;
    value: number;
  };
  const zero = { quantity: 0, reserved: 0, allocated: 0, available: 0, inQc: 0 };
  const rows: Row[] = [];
  for (const p of products) {
    const all = byProduct.get(p.id) ?? [];
    const purchasePrice = num(p.purchasePrice);
    const reorderLevel = num(p.reorderLevel);
    // Low stock is judged on the in-hand total across the branch's warehouses, like the dashboard.
    const low = isLowStock({ type: p.type, reorderLevel }, all.reduce((s, b) => s + b.quantity, 0));
    if (lowOnly && !low) continue;
    const shown = warehouseId ? all.filter((b) => b.warehouseId === warehouseId) : all;
    const entries: Array<StockBreakdown | null> = shown.length > 0 ? shown : [warehouseId ? { productId: p.id, warehouseId, ...zero } : null];
    for (const b of entries) {
      const figures = b ?? { productId: p.id, warehouseId: "", ...zero };
      rows.push({
        ...figures,
        key: `${p.id}:${figures.warehouseId}`,
        product: p,
        warehouse: b ? (warehouseById.get(b.warehouseId) ?? null) : null,
        purchasePrice,
        reorderLevel,
        low,
        value: figures.quantity * purchasePrice,
      });
    }
  }
  rows.sort((a, b) => a.product.name.localeCompare(b.product.name) || (a.warehouse?.name ?? "").localeCompare(b.warehouse?.name ?? ""));

  const total = (k: "quantity" | "reserved" | "allocated" | "available" | "inQc" | "value") => rows.reduce((s, r) => s + r[k], 0);
  const pageRows = rows.slice(skip, skip + take);
  const lowIds = [...new Set(rows.filter((r) => r.low).map((r) => r.product.id))];
  const productCount = new Set(rows.map((r) => r.product.id)).size;
  const canAdjust = can(user, "stock", "edit");
  const canReorder = can(user, "purchaseOrders", "edit");
  const colSpan = 10;

  return (
    <>
      <PageHeader
        title="Stock management"
        description="In hand, reserved, allocated, available and in-QC quantities by product and warehouse. Available = in hand − reserved."
        actions={
          <>
            {canReorder && lowIds.length > 0 && (
              <ButtonLink href={`/purchasing/orders/new?productIds=${lowIds.join(",")}`} variant="secondary">
                Reorder low stock ({lowIds.length})
              </ButtonLink>
            )}
            {canAdjust && (
              <>
                <ButtonLink href="/inventory/stock/transfer" variant="secondary">
                  Transfer
                </ButtonLink>
                <ButtonLink href="/inventory/stock/adjust">Adjust</ButtonLink>
              </>
            )}
          </>
        }
      />
      <Card>
        <ListToolbar
          q={q}
          placeholder="Search SKU or name"
          filter={{
            name: "warehouse",
            value: warehouseId,
            allLabel: "All warehouses",
            options: allWarehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}${w.isActive ? "" : " (inactive)"}` })),
          }}
        >
          <Select name="low" defaultValue={lowOnly ? "1" : ""} className="w-auto" aria-label="Stock level">
            <option value="">All stock levels</option>
            <option value="1">Low stock only</option>
          </Select>
        </ListToolbar>
        <Table>
          <THead>
            <tr>
              <TH>Product</TH>
              <TH>Warehouse</TH>
              <TH align="right">In hand</TH>
              <TH align="right">Reserved</TH>
              <TH align="right">Allocated</TH>
              <TH align="right">Available</TH>
              <TH align="right">In QC</TH>
              <TH align="right">Unit cost</TH>
              <TH align="right">Value</TH>
              <TH align="right">
                <span className="sr-only">Actions</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {pageRows.length === 0 && <EmptyRow colSpan={colSpan} />}
            {pageRows.map((r) => (
              <TR key={r.key}>
                <TD>
                  <Link href={`/inventory/products/${r.product.id}`} className="font-medium text-brand-700 hover:underline">
                    {r.product.name}
                  </Link>
                  <div className="font-mono text-xs text-ink-faint">
                    {r.product.sku}
                    {r.reorderLevel > 0 && <span className="font-sans"> · reorder at {formatNumber(r.reorderLevel)}</span>}
                  </div>
                </TD>
                <TD className="whitespace-nowrap">
                  {r.warehouse ? (
                    <Link href={`/inventory/warehouses/${r.warehouse.id}`} className="font-mono text-xs text-ink-soft hover:underline" title={r.warehouse.name}>
                      {r.warehouse.code}
                    </Link>
                  ) : (
                    <span className="text-xs text-ink-faint">No stock</span>
                  )}
                </TD>
                <TD align="right" className="font-medium">
                  <OnHand value={r.quantity} unit={r.product.unit} low={r.low} />
                </TD>
                <TD align="right" className={r.reserved === 0 ? "text-ink-faint" : undefined}>
                  {formatNumber(r.reserved)}
                </TD>
                <TD align="right" className={r.allocated === 0 ? "text-ink-faint" : undefined}>
                  {formatNumber(r.allocated)}
                </TD>
                <TD align="right" className={r.available < 0 ? "font-medium text-red-600" : "font-medium"}>
                  {formatNumber(r.available)}
                </TD>
                <TD align="right" className={r.inQc > 0 ? "text-amber-700" : "text-ink-faint"}>
                  {formatNumber(r.inQc)}
                </TD>
                <TD align="right">{formatMoney(r.purchasePrice)}</TD>
                <TD align="right">{formatMoney(r.value)}</TD>
                <TD align="right" className="whitespace-nowrap">
                  {canAdjust && (
                    <Link
                      href={`/inventory/stock/adjust?productId=${r.product.id}${r.warehouse ? `&warehouseId=${r.warehouse.id}` : ""}`}
                      className="text-xs font-medium text-brand-700 hover:underline"
                    >
                      Adjust
                    </Link>
                  )}
                  {canReorder && r.low && (
                    <Link href={`/purchasing/orders/new?productIds=${r.product.id}`} className="ml-3 text-xs font-medium text-brand-700 hover:underline">
                      Reorder
                    </Link>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
          {rows.length > 0 && (
            <tfoot className="border-t-2 border-line bg-muted/60 font-semibold">
              <tr>
                <td className="px-4 py-2.5 text-ink" colSpan={2}>
                  Total ({productCount} products)
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(total("quantity"))}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(total("reserved"))}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(total("allocated"))}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(total("available"))}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(total("inQc"))}</td>
                <td />
                <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(total("value"))}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </Table>
        <Pagination page={page} pageSize={take} total={rows.length} searchParams={sp} />
      </Card>
    </>
  );
}
