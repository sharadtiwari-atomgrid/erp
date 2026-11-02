import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { db, type Tx } from "@/lib/db";

export const BRANCH_COOKIE = "erp_branch";

export type BranchScope = {
  /** Branch whose data is shown, or null for all branches. */
  branchId: string | null;
  /** True when the user is restricted to one branch and can't switch. */
  locked: boolean;
};

/** The branch selected in the header switcher (or the user's fixed branch). */
export const getBranchScope = cache(async (): Promise<BranchScope> => {
  const user = await getCurrentUser();
  if (user?.branchId) return { branchId: user.branchId, locked: true };
  const selected = (await cookies()).get(BRANCH_COOKIE)?.value;
  if (!selected) return { branchId: null, locked: false };
  const exists = await db.branch.findFirst({ where: { id: selected, isActive: true }, select: { id: true } });
  return { branchId: exists?.id ?? null, locked: false };
});

/**
 * Prisma `where` fragment that limits a branch-owned model (SalesOrder,
 * PurchaseOrder, Invoice, InboundReceipt, OutboundOrder, ProductionOrder,
 * Trip, ReturnOrder, Warehouse…) to the current branch scope.
 */
export async function branchWhere(): Promise<{ branchId?: string }> {
  const { branchId } = await getBranchScope();
  return branchId ? { branchId } : {};
}

/** Branch to stamp on a new document: the selected branch, else the first active one. */
export async function defaultBranchId(): Promise<string> {
  const { branchId } = await getBranchScope();
  if (branchId) return branchId;
  const first = await db.branch.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!first) throw new Error("Create a branch before adding documents");
  return first.id;
}

/** Documents tied to a warehouse belong to that warehouse's branch. */
export async function warehouseBranchId(tx: Tx, warehouseId: string): Promise<string> {
  const warehouse = await tx.warehouse.findUniqueOrThrow({ where: { id: warehouseId }, select: { branchId: true } });
  return warehouse.branchId;
}
