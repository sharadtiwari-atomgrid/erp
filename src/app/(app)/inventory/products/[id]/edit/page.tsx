import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { num } from "@/lib/format";
import { updateProduct } from "../../actions";
import { ProductForm } from "../../product-form";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: PageProps<"/inventory/products/[id]/edit">) {
  await requireUser("products", "edit");
  const { id } = await params;
  const [product, categories] = await Promise.all([
    db.product.findUnique({ where: { id } }),
    db.productCategory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!product) notFound();

  return (
    <div className="max-w-3xl">
      <PageHeader title={`Edit ${product.name}`} back={{ href: `/inventory/products/${id}`, label: product.name }} />
      <ProductForm
        action={updateProduct.bind(null, id)}
        categories={categories}
        cancelHref={`/inventory/products/${id}`}
        initial={{
          ...product,
          salePrice: num(product.salePrice),
          purchasePrice: num(product.purchasePrice),
          taxRate: num(product.taxRate),
          reorderLevel: num(product.reorderLevel),
          weightKg: product.weightKg === null ? null : num(product.weightKg),
        }}
      />
    </div>
  );
}
