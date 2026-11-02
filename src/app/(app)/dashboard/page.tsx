import Link from "next/link";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime, formatMoney, formatNumber, num } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };

async function getLowStock() {
  const [products, levels] = await Promise.all([
    db.product.findMany({
      where: { isActive: true, type: "GOODS", reorderLevel: { gt: 0 } },
      select: { id: true, sku: true, name: true, unit: true, reorderLevel: true },
    }),
    db.stockLevel.groupBy({ by: ["productId"], _sum: { quantity: true } }),
  ]);
  const onHand = new Map(levels.map((l) => [l.productId, num(l._sum.quantity)]));
  return products
    .map((p) => ({ ...p, onHand: onHand.get(p.id) ?? 0, reorderLevel: num(p.reorderLevel) }))
    .filter((p) => p.onHand <= p.reorderLevel)
    .sort((a, b) => a.onHand / a.reorderLevel - b.onHand / b.reorderLevel);
}

export default async function DashboardPage() {
  const user = await requireUser("dashboard");
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [monthSales, receivables, overdue, openOrders, openPurchases, pipeline, lowStock, activity] = await Promise.all([
    db.invoice.aggregate({
      where: { issueDate: { gte: monthStart }, status: { notIn: ["DRAFT", "CANCELLED"] } },
      _sum: { total: true },
      _count: true,
    }),
    db.invoice.findMany({
      where: { status: { in: ["ISSUED", "PARTIALLY_PAID"] } },
      select: { total: true, amountPaid: true },
    }),
    db.invoice.count({ where: { status: { in: ["ISSUED", "PARTIALLY_PAID"] }, dueDate: { lt: now } } }),
    db.salesOrder.count({ where: { status: { in: ["CONFIRMED", "PARTIALLY_DELIVERED"] } } }),
    db.purchaseOrder.count({ where: { status: { in: ["ORDERED", "PARTIALLY_RECEIVED"] } } }),
    db.lead.aggregate({
      where: { status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } },
      _sum: { estimatedValue: true },
      _count: true,
    }),
    getLowStock(),
    db.activity.findMany({ orderBy: { createdAt: "desc" }, take: 10, include: { user: { select: { name: true } } } }),
  ]);

  const receivableTotal = receivables.reduce((s, i) => s + num(i.total) - num(i.amountPaid), 0);

  return (
    <>
      <PageHeader title={`Welcome back, ${user.name.split(" ")[0]}`} description="Here’s what’s happening in your business today." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Sales this month" value={formatMoney(monthSales._sum.total)} hint={`${monthSales._count} invoices`} />
        <StatCard
          label="Receivables"
          value={formatMoney(receivableTotal)}
          hint={overdue > 0 ? `${overdue} overdue` : "Nothing overdue"}
          tone={overdue > 0 ? "warning" : "default"}
        />
        <StatCard label="Open sales orders" value={openOrders} hint="Confirmed, awaiting delivery" />
        <StatCard label="Open purchase orders" value={openPurchases} hint="Awaiting receipt" />
        <StatCard label="Pipeline" value={formatMoney(pipeline._sum.estimatedValue)} hint={`${pipeline._count} open leads`} />
        <StatCard label="Low-stock items" value={lowStock.length} tone={lowStock.length > 0 ? "danger" : "default"} hint="At or below reorder level" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Low stock"
            description="Products at or below their reorder level"
            actions={
              <Link href="/inventory/stock" className="text-xs font-medium text-brand-700 hover:underline">
                View stock
              </Link>
            }
          />
          <Table>
            <THead>
              <tr>
                <TH>Product</TH>
                <TH align="right">On hand</TH>
                <TH align="right">Reorder at</TH>
              </tr>
            </THead>
            <TBody>
              {lowStock.length === 0 && <EmptyRow colSpan={3}>All products are above their reorder level.</EmptyRow>}
              {lowStock.slice(0, 8).map((p) => (
                <TR key={p.id}>
                  <TD>
                    <Link href={`/inventory/products/${p.id}`} className="font-medium text-brand-700 hover:underline">
                      {p.name}
                    </Link>
                    <div className="font-mono text-xs text-ink-faint">{p.sku}</div>
                  </TD>
                  <TD align="right">
                    <Badge tone={p.onHand <= 0 ? "red" : "amber"}>
                      {formatNumber(p.onHand)} {p.unit}
                    </Badge>
                  </TD>
                  <TD align="right">{formatNumber(p.reorderLevel)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>

        <Card>
          <CardHeader title="Recent activity" />
          <ul className="divide-y divide-line">
            {activity.length === 0 && <li className="px-5 py-10 text-center text-sm text-ink-faint">No activity yet.</li>}
            {activity.map((a) => (
              <li key={a.id} className="px-5 py-3">
                <p className="text-sm text-ink">{a.message}</p>
                <p className="mt-0.5 text-xs text-ink-faint">
                  {a.user?.name ?? "System"} · {formatDateTime(a.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
