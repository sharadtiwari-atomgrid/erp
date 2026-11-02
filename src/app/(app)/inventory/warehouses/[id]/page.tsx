import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList, StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney, num } from "@/lib/format";
import { can } from "@/lib/permissions";
import { OnHand } from "../../_components/stock-badge";

export const metadata: Metadata = { title: "Warehouse" };

export default async function WarehousePage({ params }: PageProps<"/inventory/warehouses/[id]">) {
  const user = await requireUser("warehouses");
  const { id } = await params;
  const warehouse = await db.warehouse.findUnique({
    where: { id },
    include: {
      stockLevels: {
        where: { quantity: { not: 0 } },
        orderBy: { product: { name: "asc" } },
        include: { product: { select: { id: true, sku: true, name: true, unit: true, purchasePrice: true } } },
      },
    },
  });
  if (!warehouse) notFound();

  const openPurchases = await db.purchaseOrder.count({ where: { warehouseId: id, status: { in: ["ORDERED", "PARTIALLY_RECEIVED"] } } });
  const rows = warehouse.stockLevels.map((l) => ({
    ...l.product,
    quantity: num(l.quantity),
    value: num(l.quantity) * num(l.product.purchasePrice),
  }));
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const canAdjust = can(user.role, "stock", "edit");

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {warehouse.name} <StatusBadge status={warehouse.isActive ? "ACTIVE" : "INACTIVE"} />
          </span>
        }
        description={<span className="font-mono">{warehouse.code}</span>}
        back={{ href: "/inventory/warehouses", label: "Warehouses" }}
        actions={
          <>
            <ButtonLink href={`/inventory/movements?warehouse=${id}`} variant="secondary">
              Movements
            </ButtonLink>
            {can(user.role, "warehouses", "edit") && <ButtonLink href={`/inventory/warehouses/${id}/edit`}>Edit</ButtonLink>}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Products held" value={rows.length} />
        <StatCard label="Stock value" value={formatMoney(totalValue)} hint="At purchase price" />
        <StatCard label="Open purchase orders" value={openPurchases} hint="Awaiting receipt here" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Details" />
          <CardBody>
            <DetailList
              items={[
                { label: "Code", value: warehouse.code },
                { label: "Address", value: warehouse.address },
              ]}
            />
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Stock held" />
          <Table>
            <THead>
              <tr>
                <TH>Product</TH>
                <TH align="right">On hand</TH>
                <TH align="right">Unit cost</TH>
                <TH align="right">Value</TH>
                {canAdjust && <TH align="right">Actions</TH>}
              </tr>
            </THead>
            <TBody>
              {rows.length === 0 && <EmptyRow colSpan={5}>No stock in this warehouse.</EmptyRow>}
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link href={`/inventory/products/${r.id}`} className="font-medium text-brand-700 hover:underline">
                      {r.name}
                    </Link>
                    <div className="font-mono text-xs text-ink-faint">{r.sku}</div>
                  </TD>
                  <TD align="right">
                    <OnHand value={r.quantity} unit={r.unit} low={r.quantity < 0} />
                  </TD>
                  <TD align="right">{formatMoney(r.purchasePrice)}</TD>
                  <TD align="right">{formatMoney(r.value)}</TD>
                  {canAdjust && (
                    <TD align="right">
                      <Link href={`/inventory/stock/adjust?productId=${r.id}&warehouseId=${id}`} className="text-xs font-medium text-brand-700 hover:underline">
                        Adjust
                      </Link>
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>
    </>
  );
}
