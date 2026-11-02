import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList, StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime, formatMoney, formatNumber, humanize, num } from "@/lib/format";
import { can } from "@/lib/permissions";
import { getStockBreakdown, isLowStock } from "../../_components/stock";
import { ITEM_TYPES, SUPPLY_MODES } from "../_item-meta";
import { OnHand, SignedQty } from "../../_components/stock-badge";
import { MovementReference } from "../../_components/movement-reference";

export const metadata: Metadata = { title: "Product" };

export default async function ProductPage({ params }: PageProps<"/inventory/products/[id]">) {
  const user = await requireUser("products");
  const { id } = await params;
  const product = await db.product.findUnique({
    where: { id },
    include: {
      category: { select: { name: true } },
      stockMovements: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { warehouse: { select: { code: true } }, createdBy: { select: { name: true } } },
      },
    },
  });
  if (!product) notFound();

  const isGoods = product.type === "GOODS";
  const purchasePrice = num(product.purchasePrice);
  const reorderLevel = num(product.reorderLevel);
  const breakdown = await getStockBreakdown({ productIds: [id] });
  const warehouses = await db.warehouse.findMany({
    where: { id: { in: breakdown.map((b) => b.warehouseId) } },
    select: { id: true, code: true, name: true },
  });
  const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
  const stockRows = breakdown
    .map((b) => ({ ...b, warehouse: warehouseById.get(b.warehouseId)! }))
    .filter((r) => r.warehouse)
    .sort((a, b) => a.warehouse.name.localeCompare(b.warehouse.name));
  const sum = (k: "quantity" | "reserved" | "allocated" | "available" | "inQc") => stockRows.reduce((s, r) => s + r[k], 0);
  const onHand = sum("quantity");
  const low = isLowStock({ type: product.type, reorderLevel }, onHand);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {product.name} <StatusBadge status={product.isActive ? "ACTIVE" : "INACTIVE"} />
            {!isGoods && <Badge tone="violet">Service</Badge>}
          </span>
        }
        description={<span className="font-mono">{product.sku}</span>}
        back={{ href: "/inventory/products", label: "Products" }}
        actions={
          <>
            {isGoods && can(user, "stock", "edit") && (
              <ButtonLink href={`/inventory/stock/adjust?productId=${id}`} variant="secondary">
                Adjust stock
              </ButtonLink>
            )}
            {can(user, "products", "edit") && <ButtonLink href={`/inventory/products/${id}/edit`}>Edit</ButtonLink>}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="On hand"
          value={isGoods ? `${formatNumber(onHand)} ${product.unit}` : "—"}
          tone={low ? (onHand <= 0 ? "danger" : "warning") : "default"}
          hint={isGoods ? (reorderLevel > 0 ? `Reorder at ${formatNumber(reorderLevel)}` : "No reorder level") : "Services are not stocked"}
        />
        <StatCard
          label="Available"
          value={isGoods ? `${formatNumber(sum("available"))} ${product.unit}` : "—"}
          hint={isGoods ? `${formatNumber(sum("reserved"))} reserved · ${formatNumber(sum("inQc"))} in QC` : undefined}
        />
        <StatCard label="Sale price" value={formatMoney(product.salePrice)} hint={`GST ${formatNumber(product.taxRate, 2)}%`} />
        <StatCard label="Purchase price" value={formatMoney(purchasePrice)} hint={isGoods ? `Stock value ${formatMoney(onHand * purchasePrice)}` : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Details" />
          <CardBody>
            <DetailList
              items={[
                { label: "Item type", value: `${ITEM_TYPES[product.itemType].label} — ${ITEM_TYPES[product.itemType].hint}` },
                { label: "Supply mode", value: `${SUPPLY_MODES[product.supplyMode].label} — ${SUPPLY_MODES[product.supplyMode].hint}` },
                { label: "Quality check", value: product.qcRequired ? "Required on receipt" : "Not required" },
                { label: "Weight", value: product.weightKg === null ? null : `${formatNumber(product.weightKg)} kg per ${product.unit}` },
                { label: "Category", value: product.category?.name },
                { label: "Unit", value: product.unit },
                { label: "HSN / SAC", value: product.hsnCode },
                { label: "GST rate", value: `${formatNumber(product.taxRate, 2)}%` },
                { label: "Description", value: product.description },
              ]}
            />
          </CardBody>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          {isGoods && (
            <Card>
              <CardHeader title="Stock by warehouse" description="Available = in hand − reserved. Allocated is the picked part of reserved. In QC is received but not yet in stock." />
              <Table>
                <THead>
                  <tr>
                    <TH>Warehouse</TH>
                    <TH align="right">In hand</TH>
                    <TH align="right">Reserved</TH>
                    <TH align="right">Allocated</TH>
                    <TH align="right">Available</TH>
                    <TH align="right">In QC</TH>
                    <TH align="right">Value</TH>
                    {can(user, "stock", "edit") && <TH align="right">Actions</TH>}
                  </tr>
                </THead>
                <TBody>
                  {stockRows.length === 0 && <EmptyRow colSpan={8}>No stock in any warehouse.</EmptyRow>}
                  {stockRows.map((r) => (
                    <TR key={r.warehouseId}>
                      <TD>
                        <Link href={`/inventory/warehouses/${r.warehouse.id}`} className="font-medium text-brand-700 hover:underline">
                          {r.warehouse.name}
                        </Link>
                        <div className="font-mono text-xs text-ink-faint">{r.warehouse.code}</div>
                      </TD>
                      <TD align="right">
                        <OnHand value={r.quantity} unit={product.unit} low={false} />
                      </TD>
                      <TD align="right">{formatNumber(r.reserved)}</TD>
                      <TD align="right">{formatNumber(r.allocated)}</TD>
                      <TD align="right" className={r.available < 0 ? "text-red-600" : "font-medium"}>
                        {formatNumber(r.available)}
                      </TD>
                      <TD align="right" className={r.inQc > 0 ? "text-amber-700" : "text-ink-faint"}>
                        {formatNumber(r.inQc)}
                      </TD>
                      <TD align="right">{formatMoney(r.quantity * purchasePrice)}</TD>
                      {can(user, "stock", "edit") && (
                        <TD align="right">
                          <Link
                            href={`/inventory/stock/adjust?productId=${id}&warehouseId=${r.warehouse.id}`}
                            className="text-xs font-medium text-brand-700 hover:underline"
                          >
                            Adjust
                          </Link>
                        </TD>
                      )}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Recent stock movements"
              description="Last 20 entries"
              actions={
                <Link href={`/inventory/movements?q=${encodeURIComponent(product.sku)}`} className="text-xs font-medium text-brand-700 hover:underline">
                  View all
                </Link>
              }
            />
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Type</TH>
                  <TH>Warehouse</TH>
                  <TH>Reference</TH>
                  <TH align="right">Qty</TH>
                  <TH>By</TH>
                </tr>
              </THead>
              <TBody>
                {product.stockMovements.length === 0 && <EmptyRow colSpan={6}>No movements yet.</EmptyRow>}
                {product.stockMovements.map((m) => (
                  <TR key={m.id}>
                    <TD className="whitespace-nowrap text-ink-soft">{formatDateTime(m.createdAt)}</TD>
                    <TD>{humanize(m.type)}</TD>
                    <TD className="font-mono text-xs">{m.warehouse.code}</TD>
                    <TD>
                      <MovementReference movement={m} />
                    </TD>
                    <TD align="right">
                      <SignedQty value={num(m.quantity)} />
                    </TD>
                    <TD className="text-ink-soft">{m.createdBy?.name ?? "System"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>
      </div>
    </>
  );
}
