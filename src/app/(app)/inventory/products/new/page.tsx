import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { createProduct } from "../actions";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "New product" };

export default async function NewProductPage() {
  await requireUser("products", "edit");
  const categories = await db.productCategory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <div className="max-w-3xl">
      <PageHeader title="New product" back={{ href: "/inventory/products", label: "Products" }} />
      <ProductForm action={createProduct} categories={categories} cancelHref="/inventory/products" />
    </div>
  );
}
