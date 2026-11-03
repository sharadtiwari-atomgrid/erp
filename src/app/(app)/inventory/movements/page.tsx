import Link from "next/link";
import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { ListToolbar, Pagination } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime, formatMoney, humanize, num } from "@/lib/format";
import { pagination, param } from "@/lib/forms";
import { StockMovementType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { MovementReference } from "../_components/movement-reference";
import { SignedQty } from "../_components/stock-badge";
import { branchWhere } from "@/lib/branch";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Stock movements" };

/** Parses "YYYY-MM-DD" as a local date; `endOfDay` makes the "to" filter inclusive. */
function parseDay(value: string, endOfDay = false): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return undefined;
  if (endOfDay) d.setDate(d.getDate() + 1);
  return d;
}

export default async function MovementsPage({ searchParams }: PageProps<"/inventory/movements">) {
  await requireUser("stock");
  const sp = await searchParams;
  const q = param(sp, "q");
  const type = param(sp, "type");
  const warehouseId = param(sp, "warehouse");
  const from = param(sp, "from");
  const to = param(sp, "to");
  const { page, take, skip } = pagination(sp);
  const fromDate = parseDay(from);
  const toDate = parseDay(to, true);

  const where: Prisma.StockMovementWhereInput = {
    warehouse: await branchWhere(),
    ...(q && {
      OR: [
        { product: { sku: { contains: q, mode: "insensitive" } } },
        { product: { name: { contains: q, mode: "insensitive" } } },
        { reference: { contains: q, mode: "insensitive" } },
      ],
    }),
    ...(Object.hasOwn(StockMovementType, type) && { type: type as StockMovementType }),
    ...(warehouseId && { warehouseId }),
    ...((fromDate || toDate) && { createdAt: { ...(fromDate && { gte: fromDate }), ...(toDate && { lt: toDate }) } }),
  };

  const [movements, total, warehouses] = await Promise.all([
    db.stockMovement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: {
        product: { select: { id: true, sku: true, name: true, unit: true } },
        warehouse: { select: { id: true, code: true } },
        createdBy: { select: { name: true } },
      },
    }),
    db.stockMovement.count({ where }),
    db.warehouse.findMany({ where: await branchWhere(), orderBy: { name: "asc" }, select: { id: true, code: true, name: true } }),
  ]);

  return (
    <>
      <PageHeader title="Stock movements" description="Every change to stock, newest first." />
      <Card>
        <ListToolbar
          q={q}
          placeholder="Search product or reference"
          filter={{
            name: "type",
            value: type,
            allLabel: "All types",
            options: Object.values(StockMovementType).map((t) => ({ value: t, label: humanize(t) })),
          }}
        >
          <Select name="warehouse" defaultValue={warehouseId} className="w-auto" aria-label="Warehouse">
            <option value="">All warehouses</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} — {w.name}
              </option>
            ))}
          </Select>
          <Input type="date" name="from" defaultValue={from} className="w-auto" aria-label="From date" />
          <Input type="date" name="to" defaultValue={to} className="w-auto" aria-label="To date" />
        </ListToolbar>
        <Table>
          <THead>
            <tr>
              <TH>Date</TH>
              <TH>Product</TH>
              <TH>Warehouse</TH>
              <TH>Type</TH>
              <TH>Reference</TH>
              <TH align="right">Qty</TH>
              <TH align="right">Unit cost</TH>
              <TH>By</TH>
            </tr>
          </THead>
          <TBody>
            {movements.length === 0 && <EmptyRow colSpan={8} />}
            {movements.map((m) => (
              <TR key={m.id}>
                <TD className="whitespace-nowrap text-ink-soft">{formatDateTime(m.createdAt)}</TD>
                <TD>
                  <Link href={`/inventory/products/${m.product.id}`} className="font-medium text-brand-700 hover:underline">
                    {m.product.name}
                  </Link>
                  <div className="font-mono text-xs text-ink-faint">{m.product.sku}</div>
                </TD>
                <TD>
                  <Link href={`/inventory/warehouses/${m.warehouse.id}`} className="font-mono text-xs text-brand-700 hover:underline">
                    {m.warehouse.code}
                  </Link>
                </TD>
                <TD>{humanize(m.type)}</TD>
                <TD>
                  <MovementReference movement={m} />
                </TD>
                <TD align="right">
                  <SignedQty value={num(m.quantity)} /> <span className="text-xs text-ink-faint">{m.product.unit}</span>
                </TD>
                <TD align="right">{m.unitCost === null ? "—" : formatMoney(m.unitCost)}</TD>
                <TD className="text-ink-soft">{m.createdBy?.name ?? "System"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <Pagination page={page} pageSize={take} total={total} searchParams={sp} />
      </Card>
    </>
  );
}
