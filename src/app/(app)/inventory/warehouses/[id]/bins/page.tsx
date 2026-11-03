import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatNumber, num } from "@/lib/format";
import { can } from "@/lib/permissions";
import { moveBinStock } from "../../actions";
import { MoveBinStockForm } from "../../bin-forms";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Bin stock" };

const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

export default async function BinStockPage({ params }: PageProps<"/inventory/warehouses/[id]/bins">) {
  const user = await requireUser("warehouses");
  const { id } = await params;
  const warehouse = await db.warehouse.findUnique({
    where: { id },
    include: {
      bins: {
        orderBy: { code: "asc" },
        include: {
          stocks: {
            where: { quantity: { not: 0 } },
            orderBy: { product: { name: "asc" } },
            include: { product: { select: { id: true, sku: true, name: true, unit: true } } },
          },
        },
      },
      stockLevels: {
        where: { quantity: { not: 0 } },
        orderBy: { product: { name: "asc" } },
        include: { product: { select: { id: true, sku: true, name: true, unit: true } } },
      },
    },
  });
  if (!warehouse) notFound();

  // Unbinned = on hand in the warehouse minus everything assigned to its bins.
  const binnedByProduct = new Map<string, number>();
  for (const b of warehouse.bins) for (const s of b.stocks) binnedByProduct.set(s.productId, r3((binnedByProduct.get(s.productId) ?? 0) + num(s.quantity)));
  const products = warehouse.stockLevels.map((l) => {
    const onHand = num(l.quantity);
    const binned = binnedByProduct.get(l.productId) ?? 0;
    return { ...l.product, onHand, binned, unbinned: r3(onHand - binned) };
  });
  const unbinned = Object.fromEntries(products.map((p) => [p.id, p.unbinned]));
  const binStock = Object.fromEntries(warehouse.bins.flatMap((b) => b.stocks.map((s) => [`${b.id}:${s.productId}`, num(s.quantity)])));
  const activeBins = warehouse.bins.filter((b) => b.isActive);
  const canMove = can(user, "stock", "edit") && activeBins.length > 0;

  return (
    <>
      <PageHeader
        title={`Bin stock — ${warehouse.code}`}
        description="Where stock sits inside the warehouse. Bins are optional: on-hand stock that is in no bin is shown as unbinned."
        back={{ href: `/inventory/warehouses/${id}`, label: warehouse.name }}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {warehouse.bins.length === 0 && (
            <Card>
              <CardBody className="text-center text-sm text-ink-faint">No bins in this warehouse yet. Add them on the warehouse page.</CardBody>
            </Card>
          )}
          {warehouse.bins.map((b) => (
            <Card key={b.id}>
              <div id={`bin-${b.code}`} className="scroll-mt-6" />
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <span className="font-mono">{b.code}</span>
                    {!b.isActive && <Badge>Inactive</Badge>}
                  </span>
                }
                description={b.zone ?? undefined}
                actions={<span className="text-xs text-ink-soft">{formatNumber(b.stocks.reduce((s, x) => s + num(x.quantity), 0))} units</span>}
              />
              {b.stocks.length > 0 ? (
                <Table>
                  <TBody>
                    {b.stocks.map((s) => (
                      <TR key={s.id}>
                        <TD>
                          <Link href={`/inventory/products/${s.product.id}`} className="font-medium text-brand-700 hover:underline">
                            {s.product.name}
                          </Link>
                          <span className="ml-2 font-mono text-xs text-ink-faint">{s.product.sku}</span>
                        </TD>
                        <TD align="right">
                          {formatNumber(s.quantity)} <span className="text-xs text-ink-faint">{s.product.unit}</span>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              ) : (
                <CardBody className="text-sm text-ink-faint">Empty.</CardBody>
              )}
            </Card>
          ))}
        </div>

        <div className="space-y-6">
          {canMove && (
            <Card>
              <CardHeader title="Move stock" description="Put unbinned stock into a bin, or move between bins. On-hand does not change." />
              <CardBody>
                <MoveBinStockForm
                  action={moveBinStock.bind(null, id)}
                  products={products.map(({ id: pid, sku, name, unit }) => ({ id: pid, sku, name, unit }))}
                  bins={activeBins.map((b) => ({ id: b.id, code: b.code }))}
                  binStock={binStock}
                  unbinned={unbinned}
                />
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="On hand vs binned" />
            <Table>
              <THead>
                <tr>
                  <TH>Product</TH>
                  <TH align="right">On hand</TH>
                  <TH align="right">Binned</TH>
                  <TH align="right">Unbinned</TH>
                </tr>
              </THead>
              <TBody>
                {products.length === 0 && <EmptyRow colSpan={4}>No stock.</EmptyRow>}
                {products.map((p) => (
                  <TR key={p.id}>
                    <TD>
                      <div className="font-medium">{p.name}</div>
                      <div className="font-mono text-xs text-ink-faint">{p.sku}</div>
                    </TD>
                    <TD align="right">{formatNumber(p.onHand)}</TD>
                    <TD align="right">{formatNumber(p.binned)}</TD>
                    <TD align="right" className={p.unbinned < 0 ? "text-red-600" : p.unbinned === 0 ? "text-ink-faint" : undefined}>
                      {formatNumber(p.unbinned)}
                    </TD>
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
