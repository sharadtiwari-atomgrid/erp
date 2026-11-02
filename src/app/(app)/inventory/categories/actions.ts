"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { f, parseForm, type ActionState } from "@/lib/forms";

const categorySchema = z.object({ name: f.text("Name") });

async function nameTaken(name: string, exceptId?: string) {
  const existing = await db.productCategory.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId && { id: { not: exceptId } }) },
    select: { id: true },
  });
  return existing !== null;
}

export async function createCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("products", "edit");
  const parsed = parseForm(categorySchema, formData);
  if (!parsed.ok) return parsed.state;
  if (await nameTaken(parsed.data.name)) return { error: "A category with this name already exists." };

  const category = await db.productCategory.create({ data: parsed.data });
  await logActivity({ userId: user.id, entityType: "ProductCategory", entityId: category.id, action: "created", message: `Category ${category.name} created` });

  revalidatePath("/inventory/categories");
  return { success: `Category ${category.name} created.` };
}

export async function renameCategory(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("products", "edit");
  const parsed = parseForm(categorySchema, formData);
  if (!parsed.ok) return parsed.state;
  if (await nameTaken(parsed.data.name, id)) return { error: "Name already in use." };

  const category = await db.productCategory.update({ where: { id }, data: parsed.data });
  await logActivity({ userId: user.id, entityType: "ProductCategory", entityId: id, action: "renamed", message: `Category renamed to ${category.name}` });

  revalidatePath("/inventory/categories");
  revalidatePath("/inventory/products");
  return undefined;
}

export async function deleteCategory(id: string): Promise<ActionState> {
  const user = await requireUser("products", "edit");
  const category = await db.productCategory.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
  if (!category) return { error: "Category not found." };
  if (category._count.products > 0) return { error: "Move or delete its products first." };

  await db.productCategory.delete({ where: { id } });
  await logActivity({ userId: user.id, entityType: "ProductCategory", entityId: id, action: "deleted", message: `Category ${category.name} deleted` });

  revalidatePath("/inventory/categories");
  return undefined;
}
