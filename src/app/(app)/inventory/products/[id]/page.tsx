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
import { isLowStock } from "../../_components/stock";
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
      stockLevels: { include: { warehouse: { select: { id: true, code: true, name: true } } }, orderBy: { warehouse: { name: "asc" } } },
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
  const onHand = product.stockLevels.reduce((s, l) => s + num(l.quantity), 0);
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
        <StatCard label="Stock value" value={formatMoney(isGoods ? onHand * purchasePrice : 0)} hint="At purchase price" />
        <StatCard label="Sale price" value={formatMoney(product.salePrice)} hint={`GST ${formatNumber(product.taxRate, 2)}%`} />
        <StatCard label="Purchase price" value={formatMoney(purchasePrice)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Details" />
          <CardBody>
            <DetailList
              items={[
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
              <CardHeader title="Stock by warehouse" />
              <Table>
                <THead>
                  <tr>
                    <TH>Warehouse</TH>
                    <TH align="right">On hand</TH>
                    <TH align="right">Value</TH>
                    {can(user, "stock", "edit") && <TH align="right">Actions</TH>}
                  </tr>
                </THead>
                <TBody>
                  {product.stockLevels.length === 0 && <EmptyRow colSpan={4}>No stock in any warehouse.</EmptyRow>}
                  {product.stockLevels.map((l) => (
                    <TR key={l.id}>
                      <TD>
                        <Link href={`/inventory/warehouses/${l.warehouse.id}`} className="font-medium text-brand-700 hover:underline">
                          {l.warehouse.name}
                        </Link>
                        <div className="font-mono text-xs text-ink-faint">{l.warehouse.code}</div>
                      </TD>
                      <TD align="right">
                        <OnHand value={num(l.quantity)} unit={product.unit} low={false} />
                      </TD>
                      <TD align="right">{formatMoney(num(l.quantity) * purchasePrice)}</TD>
                      {can(user, "stock", "edit") && (
                        <TD align="right">
                          <Link
                            href={`/inventory/stock/adjust?productId=${id}&warehouseId=${l.warehouse.id}`}
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
