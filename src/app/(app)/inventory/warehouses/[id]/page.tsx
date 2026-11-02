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
import { formatMoney, formatNumber, num } from "@/lib/format";
import { can } from "@/lib/permissions";
import { OnHand } from "../../_components/stock-badge";
import { ActionButton } from "@/components/ui/action-button";
import { addBin, setBinActive } from "../actions";
import { AddBinForm } from "../bin-forms";

export const metadata: Metadata = { title: "Warehouse" };

export default async function WarehousePage({ params }: PageProps<"/inventory/warehouses/[id]">) {
  const user = await requireUser("warehouses");
  const { id } = await params;
  const warehouse = await db.warehouse.findUnique({
    where: { id },
    include: {
      stockLevels: {
        where: { OR: [{ quantity: { not: 0 } }, { reservedQty: { not: 0 } }] },
        orderBy: { product: { name: "asc" } },
        include: { product: { select: { id: true, sku: true, name: true, unit: true, purchasePrice: true } } },
      },
      bins: { orderBy: { code: "asc" }, include: { stocks: { where: { quantity: { gt: 0 } }, select: { quantity: true } } } },
    },
  });
  if (!warehouse) notFound();

  const openPurchases = await db.purchaseOrder.count({ where: { warehouseId: id, status: { in: ["ORDERED", "PARTIALLY_RECEIVED"] } } });
  const rows = warehouse.stockLevels.map((l) => ({
    ...l.product,
    quantity: num(l.quantity),
    reserved: num(l.reservedQty),
    value: num(l.quantity) * num(l.product.purchasePrice),
  }));
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const canAdjust = can(user, "stock", "edit");
  const canManageBins = can(user, "warehouses", "edit");
  const binnedUnits = warehouse.bins.reduce((s, b) => s + b.stocks.reduce((t, x) => t + num(x.quantity), 0), 0);

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
            <ButtonLink href={`/inventory/warehouses/${id}/bins`} variant="secondary">
              Bin stock
            </ButtonLink>
            <ButtonLink href={`/inventory/movements?warehouse=${id}`} variant="secondary">
              Movements
            </ButtonLink>
            {can(user, "warehouses", "edit") && <ButtonLink href={`/inventory/warehouses/${id}/edit`}>Edit</ButtonLink>}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Products held" value={rows.filter((r) => r.quantity !== 0).length} />
        <StatCard label="Stock value" value={formatMoney(totalValue)} hint="At purchase price" />
        <StatCard label="Open purchase orders" value={openPurchases} hint="Awaiting receipt here" />
        <StatCard
          label="Bins"
          value={warehouse.bins.filter((b) => b.isActive).length}
          hint={`${formatNumber(binnedUnits)} units binned`}
        />
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
                <TH align="right">Reserved</TH>
                <TH align="right">Available</TH>
                <TH align="right">Unit cost</TH>
                <TH align="right">Value</TH>
                {canAdjust && <TH align="right">Actions</TH>}
              </tr>
            </THead>
            <TBody>
              {rows.length === 0 && <EmptyRow colSpan={7}>No stock in this warehouse.</EmptyRow>}
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
                  <TD align="right" className={r.reserved === 0 ? "text-ink-faint" : undefined}>
                    {formatNumber(r.reserved)}
                  </TD>
                  <TD align="right" className="font-medium">
                    {formatNumber(r.quantity - r.reserved)}
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

      <Card className="mt-6">
        <CardHeader
          title="Bins"
          description="Optional locations inside the warehouse. Stock can be put away to a bin on inbound QC and picked from a bin on outbound."
          actions={
            <ButtonLink href={`/inventory/warehouses/${id}/bins`} variant="secondary" size="sm">
              Bin stock
            </ButtonLink>
          }
        />
        <Table>
          <THead>
            <tr>
              <TH>Code</TH>
              <TH>Zone</TH>
              <TH align="right">Products</TH>
              <TH align="right">Units</TH>
              <TH>Status</TH>
              {canManageBins && (
                <TH align="right">
                  <span className="sr-only">Actions</span>
                </TH>
              )}
            </tr>
          </THead>
          <TBody>
            {warehouse.bins.length === 0 && <EmptyRow colSpan={6}>No bins yet.</EmptyRow>}
            {warehouse.bins.map((b) => {
              const units = b.stocks.reduce((s, x) => s + num(x.quantity), 0);
              return (
                <TR key={b.id}>
                  <TD className="font-mono text-sm font-medium">
                    <Link href={`/inventory/warehouses/${id}/bins#bin-${b.code}`} className="text-brand-700 hover:underline">
                      {b.code}
                    </Link>
                  </TD>
                  <TD className="text-ink-soft">{b.zone ?? "—"}</TD>
                  <TD align="right">{b.stocks.length}</TD>
                  <TD align="right">{formatNumber(units)}</TD>
                  <TD>
                    <StatusBadge status={b.isActive ? "ACTIVE" : "INACTIVE"} />
                  </TD>
                  {canManageBins && (
                    <TD align="right">
                      <ActionButton
                        action={setBinActive.bind(null, b.id, !b.isActive)}
                        variant="ghost"
                        size="sm"
                        pendingText="Saving…"
                        disabled={b.isActive && units > 0}
                        title={b.isActive && units > 0 ? "Move the stock out first" : undefined}
                      >
                        {b.isActive ? "Deactivate" : "Reactivate"}
                      </ActionButton>
                    </TD>
                  )}
                </TR>
              );
            })}
          </TBody>
        </Table>
        {canManageBins && (
          <CardBody className="border-t border-line">
            <AddBinForm action={addBin.bind(null, id)} />
          </CardBody>
        )}
      </Card>
    </>
  );
}
