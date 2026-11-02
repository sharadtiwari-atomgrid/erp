import Link from "next/link";
import type { Metadata } from "next";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { ListToolbar, Pagination } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney, num } from "@/lib/format";
import { pagination, param } from "@/lib/forms";
import { can } from "@/lib/permissions";
import type { Prisma } from "@/generated/prisma/client";
import { getOnHandByProduct, isLowStock } from "../_components/stock";
import { OnHand } from "../_components/stock-badge";

export const metadata: Metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: PageProps<"/inventory/products">) {
  const user = await requireUser("products");
  const sp = await searchParams;
  const q = param(sp, "q");
  const categoryId = param(sp, "category");
  const status = param(sp, "status");
  const { page, take, skip } = pagination(sp);

  const where: Prisma.ProductWhereInput = {
    ...(q && {
      OR: [
        { sku: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { hsnCode: { contains: q } },
      ],
    }),
    ...(categoryId && { categoryId }),
    ...(status === "ACTIVE" && { isActive: true }),
    ...(status === "INACTIVE" && { isActive: false }),
  };

  const [products, total, categories] = await Promise.all([
    db.product.findMany({ where, orderBy: { name: "asc" }, take, skip, include: { category: { select: { name: true } } } }),
    db.product.count({ where }),
    db.productCategory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const onHand = await getOnHandByProduct(products.map((p) => p.id));

  return (
    <>
      <PageHeader
        title="Products"
        description="Goods you stock and services you sell."
        actions={can(user.role, "products", "edit") && <ButtonLink href="/inventory/products/new">New product</ButtonLink>}
      />
      <Card>
        <ListToolbar
          q={q}
          placeholder="Search SKU, name, HSN"
          filter={{
            name: "category",
            value: categoryId,
            allLabel: "All categories",
            options: categories.map((c) => ({ value: c.id, label: c.name })),
          }}
        >
          <Select name="status" defaultValue={status} className="w-auto" aria-label="Status">
            <option value="">Active and inactive</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
        </ListToolbar>
        <Table>
          <THead>
            <tr>
              <TH>SKU</TH>
              <TH>Name</TH>
              <TH>Category</TH>
              <TH>HSN</TH>
              <TH align="right">Sale price</TH>
              <TH align="right">Purchase price</TH>
              <TH align="right">On hand</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {products.length === 0 && <EmptyRow colSpan={8} />}
            {products.map((p) => {
              const qty = onHand.get(p.id) ?? 0;
              const low = isLowStock({ type: p.type, reorderLevel: num(p.reorderLevel) }, qty);
              return (
                <TR key={p.id}>
                  <TD className="font-mono text-xs text-ink-soft">{p.sku}</TD>
                  <TD>
                    <Link href={`/inventory/products/${p.id}`} className="font-medium text-brand-700 hover:underline">
                      {p.name}
                    </Link>
                    {p.type === "SERVICE" && (
                      <span className="ml-2">
                        <Badge tone="violet">Service</Badge>
                      </span>
                    )}
                  </TD>
                  <TD className="text-ink-soft">{p.category?.name ?? "—"}</TD>
                  <TD className="font-mono text-xs">{p.hsnCode ?? "—"}</TD>
                  <TD align="right">{formatMoney(p.salePrice)}</TD>
                  <TD align="right">{formatMoney(p.purchasePrice)}</TD>
                  <TD align="right">{p.type === "SERVICE" ? <span className="text-ink-faint">—</span> : <OnHand value={qty} unit={p.unit} low={low} />}</TD>
                  <TD>
                    <StatusBadge status={p.isActive ? "ACTIVE" : "INACTIVE"} />
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
        <Pagination page={page} pageSize={take} total={total} searchParams={sp} />
      </Card>
    </>
  );
}
