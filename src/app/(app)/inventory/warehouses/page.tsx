import Link from "next/link";
import type { Metadata } from "next";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney, formatNumber, num } from "@/lib/format";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Warehouses" };

export default async function WarehousesPage() {
  const user = await requireUser("warehouses");
  const [warehouses, levels] = await Promise.all([
    db.warehouse.findMany({ orderBy: { name: "asc" } }),
    db.stockLevel.findMany({
      where: { quantity: { not: 0 } },
      select: { warehouseId: true, quantity: true, product: { select: { purchasePrice: true } } },
    }),
  ]);

  // Products held, units and value per warehouse.
  const totals = new Map<string, { products: number; units: number; value: number }>();
  for (const l of levels) {
    const t = totals.get(l.warehouseId) ?? { products: 0, units: 0, value: 0 };
    t.products += 1;
    t.units += num(l.quantity);
    t.value += num(l.quantity) * num(l.product.purchasePrice);
    totals.set(l.warehouseId, t);
  }

  return (
    <>
      <PageHeader
        title="Warehouses"
        description="Locations where you hold stock."
        actions={can(user.role, "warehouses", "edit") && <ButtonLink href="/inventory/warehouses/new">New warehouse</ButtonLink>}
      />
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Code</TH>
              <TH>Name</TH>
              <TH>Address</TH>
              <TH align="right">Products</TH>
              <TH align="right">Units</TH>
              <TH align="right">Stock value</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {warehouses.length === 0 && <EmptyRow colSpan={7} />}
            {warehouses.map((w) => {
              const t = totals.get(w.id);
              return (
                <TR key={w.id}>
                  <TD className="font-mono text-xs text-ink-soft">{w.code}</TD>
                  <TD>
                    <Link href={`/inventory/warehouses/${w.id}`} className="font-medium text-brand-700 hover:underline">
                      {w.name}
                    </Link>
                  </TD>
                  <TD className="text-ink-soft">{w.address ?? "—"}</TD>
                  <TD align="right">{t?.products ?? 0}</TD>
                  <TD align="right">{formatNumber(t?.units ?? 0)}</TD>
                  <TD align="right">{formatMoney(t?.value ?? 0)}</TD>
                  <TD>
                    <StatusBadge status={w.isActive ? "ACTIVE" : "INACTIVE"} />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
