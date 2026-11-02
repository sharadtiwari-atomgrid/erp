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
import { isLowStock } from "../_components/stock";
import { OnHand } from "../_components/stock-badge";

export const metadata: Metadata = { title: "Stock on hand" };

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

  const [products, allWarehouses, levels] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true, unit: true, type: true, purchasePrice: true, reorderLevel: true },
    }),
    db.warehouse.findMany({ orderBy: { name: "asc" }, select: { id: true, code: true, name: true, isActive: true } }),
    db.stockLevel.findMany({ where: { quantity: { not: 0 } }, select: { productId: true, warehouseId: true, quantity: true } }),
  ]);

  // Inactive warehouses still show up while they hold stock.
  const holding = new Set(levels.map((l) => l.warehouseId));
  const warehouses = allWarehouses.filter((w) => (warehouseId ? w.id === warehouseId : w.isActive || holding.has(w.id)));

  const qty = new Map(levels.map((l) => [`${l.productId}:${l.warehouseId}`, num(l.quantity)]));
  const rows = products
    .map((p) => {
      const perWarehouse = warehouses.map((w) => qty.get(`${p.id}:${w.id}`) ?? 0);
      const shown = perWarehouse.reduce((s, n) => s + n, 0);
      // Low stock is judged on the company-wide total, like the dashboard.
      const overall = allWarehouses.reduce((s, w) => s + (qty.get(`${p.id}:${w.id}`) ?? 0), 0);
      const purchasePrice = num(p.purchasePrice);
      const reorderLevel = num(p.reorderLevel);
      return {
        ...p,
        purchasePrice,
        reorderLevel,
        perWarehouse,
        total: shown,
        value: shown * purchasePrice,
        low: isLowStock({ type: p.type, reorderLevel }, overall),
      };
    })
    .filter((r) => !lowOnly || r.low);

  const grand = {
    perWarehouse: warehouses.map((_, i) => rows.reduce((s, r) => s + r.perWarehouse[i], 0)),
    total: rows.reduce((s, r) => s + r.total, 0),
    value: rows.reduce((s, r) => s + r.value, 0),
  };
  const pageRows = rows.slice(skip, skip + take);
  const lowIds = rows.filter((r) => r.low).map((r) => r.id);
  const canAdjust = can(user.role, "stock", "edit");
  const canReorder = can(user.role, "purchaseOrders", "edit");
  const colSpan = warehouses.length + 5;

  return (
    <>
      <PageHeader
        title="Stock on hand"
        description="Quantities by product and warehouse, valued at purchase price."
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
            options: allWarehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })),
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
              {warehouses.map((w) => (
                <TH key={w.id} align="right" title={w.name}>
                  {w.code}
                </TH>
              ))}
              <TH align="right">Total</TH>
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
              <TR key={r.id}>
                <TD>
                  <Link href={`/inventory/products/${r.id}`} className="font-medium text-brand-700 hover:underline">
                    {r.name}
                  </Link>
                  <div className="font-mono text-xs text-ink-faint">
                    {r.sku}
                    {r.reorderLevel > 0 && <span className="font-sans"> · reorder at {formatNumber(r.reorderLevel)}</span>}
                  </div>
                </TD>
                {r.perWarehouse.map((n, i) => (
                  <TD key={warehouses[i].id} align="right" className={n === 0 ? "text-ink-faint" : undefined}>
                    {formatNumber(n)}
                  </TD>
                ))}
                <TD align="right" className="font-medium">
                  <OnHand value={r.total} unit={r.unit} low={r.low} />
                </TD>
                <TD align="right">{formatMoney(r.purchasePrice)}</TD>
                <TD align="right">{formatMoney(r.value)}</TD>
                <TD align="right" className="whitespace-nowrap">
                  {canAdjust && (
                    <Link
                      href={`/inventory/stock/adjust?productId=${r.id}${warehouseId ? `&warehouseId=${warehouseId}` : ""}`}
                      className="text-xs font-medium text-brand-700 hover:underline"
                    >
                      Adjust
                    </Link>
                  )}
                  {canReorder && r.low && (
                    <Link href={`/purchasing/orders/new?productIds=${r.id}`} className="ml-3 text-xs font-medium text-brand-700 hover:underline">
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
                <td className="px-4 py-2.5 text-ink">Total ({rows.length} products)</td>
                {grand.perWarehouse.map((n, i) => (
                  <td key={warehouses[i].id} className="px-4 py-2.5 text-right tabular-nums">
                    {formatNumber(n)}
                  </td>
                ))}
                <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(grand.total)}</td>
                <td />
                <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(grand.value)}</td>
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
