import Link from "next/link";
import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { ActionButton } from "@/components/ui/action-button";
import { createCategory, deleteCategory, renameCategory } from "./actions";
import { NewCategoryForm, RenameCategoryForm } from "./category-forms";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const user = await requireUser("products");
  const canEdit = can(user, "products", "edit");
  const categories = await db.productCategory.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });

  return (
    <div className="max-w-3xl">
      <PageHeader title="Categories" description="Group products for searching and reporting." />
      <Card>
        {canEdit && <NewCategoryForm action={createCategory} />}
        <Table>
          <THead>
            <tr>
              <TH>Name</TH>
              <TH align="right">Products</TH>
              <TH>Created</TH>
              {canEdit && <TH align="right">Actions</TH>}
            </tr>
          </THead>
          <TBody>
            {categories.length === 0 && <EmptyRow colSpan={4}>No categories yet.</EmptyRow>}
            {categories.map((c) => (
              <TR key={c.id}>
                <TD>{canEdit ? <RenameCategoryForm action={renameCategory.bind(null, c.id)} name={c.name} /> : c.name}</TD>
                <TD align="right">
                  <Link href={`/inventory/products?category=${c.id}`} className="text-brand-700 hover:underline">
                    {c._count.products}
                  </Link>
                </TD>
                <TD className="text-ink-soft">{formatDate(c.createdAt)}</TD>
                {canEdit && (
                  <TD align="right">
                    <ActionButton
                      action={deleteCategory.bind(null, c.id)}
                      variant="ghost"
                      size="sm"
                      disabled={c._count.products > 0}
                      title={c._count.products > 0 ? "Only empty categories can be deleted" : undefined}
                      confirmMessage={`Delete category ${c.name}?`}
                      pendingText="Deleting…"
                    >
                      Delete
                    </ActionButton>
                  </TD>
                )}
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
