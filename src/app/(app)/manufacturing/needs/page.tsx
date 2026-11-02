import Link from "next/link";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { buttonClass, ButtonLink } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { branchWhere } from "@/lib/branch";
import { db } from "@/lib/db";
import { formatDate, formatNumber, num } from "@/lib/format";
import { param } from "@/lib/forms";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/cn";
import { ModeBadge } from "../_components/badges";
import { round3 } from "../_lib/bom-math";
import { analyseNeeds, type NeedProduct, type NeedResult, type Recommendation } from "../_lib/needs";
import { availableByProduct, getPlantWarehouseId, OPEN_ORDER_STATUSES } from "../_lib/server";

export const metadata: Metadata = { title: "Manufacturing needs" };

const REC: Record<Recommendation, { label: string; tone: "green" | "blue" | "amber" | "violet"; hint: string }> = {
  DISPATCH: { label: "Dispatch", tone: "green", hint: "Enough stock to ship now" },
  PRODUCE: { label: "Produce", tone: "blue", hint: "Short; make it" },
  PROCURE: { label: "Procure", tone: "amber", hint: "Short; buy it" },
  IN_PRODUCTION: { label: "In production", tone: "violet", hint: "Covered by open production orders" },
};
const REC_ORDER: Recommendation[] = ["DISPATCH", "PRODUCE", "PROCURE", "IN_PRODUCTION"];

const DAY = 86_400_000;

function bucket(date: Date | null, today: Date): { key: string; label: string } {
  if (!date) return { key: "4", label: "No required date" };
  const t = date.getTime();
  if (t < today.getTime()) return { key: "0", label: "Overdue" };
  if (t < today.getTime() + 7 * DAY) return { key: "1", label: "Due in the next 7 days" };
  if (t < today.getTime() + 30 * DAY) return { key: "2", label: "Due in 8–30 days" };
  return { key: "3", label: "Due later" };
}

export default async function ManufacturingNeedsPage({ searchParams }: PageProps<"/manufacturing/needs">) {
  const user = await requireUser("mfgNeeds");
  const sp = await searchParams;
  const recFilter = param(sp, "recommendation");
  const customerFilter = param(sp, "customerId");
  const scope = await branchWhere();

  const soLines = await db.salesOrderLine.findMany({
    where: { salesOrder: { ...scope, status: { in: ["CONFIRMED", "PARTIALLY_DELIVERED"] } } },
    include: {
      product: { select: { id: true, sku: true, name: true, unit: true, supplyMode: true, itemType: true, type: true } },
      salesOrder: {
        select: {
          id: true,
          number: true,
          orderDate: true,
          expectedDate: true,
          warehouseId: true,
          warehouse: { select: { code: true } },
          customer: { select: { id: true, name: true } },
        },
      },
    },
  });
  const open = soLines.filter((l) => l.product.type === "GOODS" && round3(num(l.quantity) - num(l.deliveredQty)) > 0);
  const productIds = [...new Set(open.map((l) => l.productId))];
  const warehouseIds = [...new Set(open.map((l) => l.salesOrder.warehouseId))];

  const [levels, boms, orders, plantWarehouseId] = await Promise.all([
    db.stockLevel.findMany({
      where: { productId: { in: productIds }, warehouseId: { in: warehouseIds } },
      select: { productId: true, warehouseId: true, quantity: true, reservedQty: true },
    }),
    db.bom.findMany({
      where: { productId: { in: productIds }, isActive: true },
      orderBy: [{ isDefault: "desc" }, { version: "desc" }],
      include: { lines: true },
    }),
    db.productionOrder.findMany({
      where: { productId: { in: productIds }, status: { in: [...OPEN_ORDER_STATUSES] } },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      select: { id: true, number: true, productId: true, salesOrderLineId: true, quantity: true, producedQty: true },
    }),
    getPlantWarehouseId(),
  ]);

  const products = new Map<string, NeedProduct>();
  for (const l of open) {
    if (products.has(l.productId)) continue;
    const bom = boms.find((b) => b.productId === l.productId);
    products.set(l.productId, {
      id: l.productId,
      supplyMode: l.product.supplyMode,
      itemType: l.product.itemType,
      bom: bom
        ? { outputQty: num(bom.outputQty), lines: bom.lines.map((x) => ({ componentId: x.componentId, quantity: num(x.quantity), scrapPct: num(x.scrapPct) })) }
        : null,
    });
  }
  const componentIds = [...new Set(boms.flatMap((b) => b.lines.map((x) => x.componentId)))];
  const [componentStock, componentProducts] = await Promise.all([
    plantWarehouseId ? availableByProduct(plantWarehouseId, componentIds) : Promise.resolve(new Map<string, number>()),
    db.product.findMany({ where: { id: { in: componentIds } }, select: { id: true, name: true, unit: true } }),
  ]);
  const componentName = new Map(componentProducts.map((p) => [p.id, p]));
  const orderNumber = new Map(orders.map((o) => [o.id, o.number]));

  const results = analyseNeeds({
    lines: open.map((l) => ({
      id: l.id,
      salesOrderId: l.salesOrderId,
      warehouseId: l.salesOrder.warehouseId,
      requiredDate: l.salesOrder.expectedDate,
      productId: l.productId,
      outstanding: round3(num(l.quantity) - num(l.deliveredQty)),
      reservedForLine: num(l.reservedQty),
      sortKey: `${l.salesOrder.number}-${String(l.position).padStart(4, "0")}`,
    })),
    products,
    stock: new Map(levels.map((s) => [`${s.productId}:${s.warehouseId}`, round3(num(s.quantity) - num(s.reservedQty))])),
    openOrders: orders.map((o) => ({ id: o.id, productId: o.productId, salesOrderLineId: o.salesOrderLineId, remaining: round3(num(o.quantity) - num(o.producedQty)) })),
    componentStock,
  });

  const lineById = new Map(open.map((l) => [l.id, l]));
  const customers = [...new Map(open.map((l) => [l.salesOrder.customer.id, l.salesOrder.customer.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const visible = results.filter(
    (r) =>
      (!recFilter || r.recommendation === recFilter) && (!customerFilter || lineById.get(r.lineId)!.salesOrder.customer.id === customerFilter),
  );
  const counts = (rec: Recommendation) =>
    results.filter((r) => r.recommendation === rec && (!customerFilter || lineById.get(r.lineId)!.salesOrder.customer.id === customerFilter)).length;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const groups = new Map<string, { label: string; rows: NeedResult[] }>();
  for (const r of visible) {
    const b = bucket(lineById.get(r.lineId)!.salesOrder.expectedDate, today);
    if (!groups.has(b.key)) groups.set(b.key, { label: b.label, rows: [] });
    groups.get(b.key)!.rows.push(r);
  }
  const sortedGroups = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const canProduce = can(user, "production", "edit");
  const canBuy = can(user, "purchaseOrders", "edit");
  const canSeeSales = can(user, "salesOrders");
  const filterHref = (rec: string) => {
    const qs = new URLSearchParams();
    if (rec) qs.set("recommendation", rec);
    if (customerFilter) qs.set("customerId", customerFilter);
    const s = qs.toString();
    return s ? `/manufacturing/needs?${s}` : "/manufacturing/needs";
  };

  return (
    <>
      <PageHeader
        title="Manufacturing needs"
        description="Open sales order lines compared with stock in the order's warehouse and open production. One recommended next step per line; earlier required dates get first claim on stock."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {REC_ORDER.map((rec) => (
          <Link key={rec} href={filterHref(recFilter === rec ? "" : rec)} className={cn("rounded-lg", recFilter === rec && "ring-2 ring-brand-500")}>
            <StatCard label={REC[rec].label} value={counts(rec)} hint={REC[rec].hint} tone={rec === "PROCURE" && counts(rec) > 0 ? "warning" : "default"} />
          </Link>
        ))}
      </div>

      <Card>
        <form className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <Select name="recommendation" defaultValue={recFilter} className="w-auto" aria-label="Recommendation">
            <option value="">All recommendations</option>
            {REC_ORDER.map((r) => (
              <option key={r} value={r}>
                {REC[r].label}
              </option>
            ))}
          </Select>
          <Select name="customerId" defaultValue={customerFilter} className="w-auto" aria-label="Customer">
            <option value="">All customers</option>
            {customers.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </Select>
          <button type="submit" className={buttonClass("secondary")}>
            Apply
          </button>
          {(recFilter || customerFilter) && (
            <Link href="/manufacturing/needs" className="text-xs text-ink-soft hover:text-ink">
              Clear
            </Link>
          )}
        </form>
        <Table>
          <THead>
            <tr>
              <TH>Sales order</TH>
              <TH>Product</TH>
              <TH align="right">Outstanding</TH>
              <TH align="right">From stock</TH>
              <TH align="right">In production</TH>
              <TH align="right">Gap</TH>
              <TH>Next step</TH>
            </tr>
          </THead>
          {visible.length === 0 && (
            <TBody>
              <EmptyRow colSpan={7}>No open sales order lines need attention.</EmptyRow>
            </TBody>
          )}
          {sortedGroups.map(([key, group]) => (
            <TBody key={key}>
              <tr className="bg-muted/40">
                <td colSpan={7} className={cn("px-4 py-1.5 text-xs font-semibold uppercase tracking-wide", key === "0" ? "text-red-700" : "text-ink-soft")}>
                  {group.label} · {group.rows.length}
                </td>
              </tr>
              {group.rows.map((r) => {
                const l = lineById.get(r.lineId)!;
                const short = r.components.filter((c) => c.short > 0);
                return (
                  <TR key={r.lineId} className="align-top">
                    <TD>
                      {canSeeSales ? (
                        <Link href={`/sales/orders/${l.salesOrder.id}`} className="font-medium text-brand-700 hover:underline">
                          {l.salesOrder.number}
                        </Link>
                      ) : (
                        <span className="font-medium">{l.salesOrder.number}</span>
                      )}
                      <div className="text-xs text-ink-soft">{l.salesOrder.customer.name}</div>
                      <div className={cn("text-xs", key === "0" ? "text-red-700" : "text-ink-faint")}>
                        Required {formatDate(l.salesOrder.expectedDate)} · {l.salesOrder.warehouse.code}
                      </div>
                    </TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        {l.product.name} <ModeBadge mode={l.product.supplyMode} />
                      </div>
                      <div className="font-mono text-xs text-ink-faint">{l.product.sku}</div>
                    </TD>
                    <TD align="right">
                      {formatNumber(r.outstanding)} <span className="text-xs text-ink-faint">{l.product.unit}</span>
                    </TD>
                    <TD align="right" className={r.fromStock > 0 ? "text-emerald-700" : "text-ink-faint"}>
                      {formatNumber(r.fromStock)}
                    </TD>
                    <TD align="right" className={r.inProduction > 0 ? "text-violet-700" : "text-ink-faint"}>
                      {formatNumber(r.inProduction)}
                    </TD>
                    <TD align="right" className={r.gap > 0 ? "font-semibold text-red-700" : "text-ink-faint"}>
                      {formatNumber(r.gap)}
                    </TD>
                    <TD className="min-w-64">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={REC[r.recommendation].tone}>{REC[r.recommendation].label}</Badge>
                        {r.recommendation === "DISPATCH" && canSeeSales && (
                          <ButtonLink href={`/sales/orders/${l.salesOrder.id}`} size="sm" variant="secondary">
                            Open sales order
                          </ButtonLink>
                        )}
                        {r.recommendation === "PRODUCE" && !r.needsBom && canProduce && (
                          <ButtonLink href={`/manufacturing/orders/new?salesOrderId=${l.salesOrder.id}&salesOrderLineId=${l.id}`} size="sm">
                            Create production order
                          </ButtonLink>
                        )}
                        {r.recommendation === "PRODUCE" && r.needsBom && can(user, "hubSettings", "edit") && (
                          <ButtonLink href={`/manufacturing/hub/boms/new?productId=${l.productId}`} size="sm" variant="secondary">
                            Set up BOM first
                          </ButtonLink>
                        )}
                        {r.recommendation === "PROCURE" && canBuy && (
                          <ButtonLink href={`/purchasing/orders/new?productIds=${l.productId}`} size="sm">
                            Create purchase order
                          </ButtonLink>
                        )}
                      </div>
                      {r.recommendation !== "DISPATCH" && r.fromStock > 0 && (
                        <p className="mt-1 text-xs text-ink-soft">{formatNumber(r.fromStock)} can ship from stock now.</p>
                      )}
                      {r.productionOrderIds.length > 0 && (
                        <p className="mt-1 text-xs text-ink-soft">
                          Production:{" "}
                          {r.productionOrderIds.map((id, i) => (
                            <span key={id}>
                              {i > 0 && ", "}
                              <Link href={`/manufacturing/orders/${id}`} className="text-brand-700 hover:underline">
                                {orderNumber.get(id)}
                              </Link>
                            </span>
                          ))}
                        </p>
                      )}
                      {r.recommendation === "PRODUCE" && r.needsBom && <p className="mt-1 text-xs text-amber-700">No active BOM for this product.</p>}
                      {r.recommendation === "PRODUCE" && !r.needsBom && (
                        <div className="mt-1.5 text-xs">
                          {short.length === 0 ? (
                            <span className="text-emerald-700">Components available for {formatNumber(r.gap)}.</span>
                          ) : (
                            <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-900">
                              <p>
                                Components short:{" "}
                                {short.map((c) => `${componentName.get(c.componentId)?.name ?? "?"} (${formatNumber(c.short)} ${componentName.get(c.componentId)?.unit ?? ""})`).join(", ")}
                              </p>
                              {canBuy && (
                                <Link
                                  href={`/purchasing/orders/new?productIds=${short.map((c) => c.componentId).join(",")}`}
                                  className="mt-0.5 inline-block font-medium text-brand-700 hover:underline"
                                >
                                  Procure components →
                                </Link>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          ))}
        </Table>
      </Card>
      <p className="mt-3 text-xs text-ink-faint">
        Component availability is checked in the production warehouse and allocated across lines in required-date order. Unlinked (make-to-stock) production orders count toward the earliest lines first.
      </p>
    </>
  );
}
