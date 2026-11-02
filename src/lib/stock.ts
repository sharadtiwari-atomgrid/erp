import "server-only";
import type { Tx } from "@/lib/db";
import type { StockMovementType } from "@/generated/prisma/enums";

export class InsufficientStockError extends Error {
  constructor(public productName: string, public available: number, public requested: number) {
    super(`Not enough stock for ${productName}: ${available} available, ${requested} requested`);
  }
}

export type StockChange = {
  productId: string;
  warehouseId: string;
  /** Signed quantity: positive adds stock, negative removes it. */
  quantity: number;
  type: StockMovementType;
  unitCost?: number | null;
  referenceType?: string;
  referenceId?: string;
  reference?: string;
  note?: string;
  userId?: string | null;
  allowNegative?: boolean;
};

/**
 * The only way stock should change. Writes a StockMovement and updates the
 * StockLevel for the product/warehouse in the same transaction. Services are
 * ignored. Throws InsufficientStockError if stock would go negative.
 */
export async function adjustStock(tx: Tx, change: StockChange) {
  if (change.quantity === 0) return;

  const product = await tx.product.findUniqueOrThrow({
    where: { id: change.productId },
    select: { name: true, type: true },
  });
  if (product.type === "SERVICE") return;

  const level = await tx.stockLevel.upsert({
    where: { productId_warehouseId: { productId: change.productId, warehouseId: change.warehouseId } },
    create: { productId: change.productId, warehouseId: change.warehouseId, quantity: change.quantity },
    update: { quantity: { increment: change.quantity } },
  });

  const after = Number(level.quantity);
  if (after < 0 && !change.allowNegative) {
    throw new InsufficientStockError(product.name, after - change.quantity, -change.quantity);
  }

  await tx.stockMovement.create({
    data: {
      productId: change.productId,
      warehouseId: change.warehouseId,
      quantity: change.quantity,
      type: change.type,
      unitCost: change.unitCost ?? null,
      referenceType: change.referenceType,
      referenceId: change.referenceId,
      reference: change.reference,
      note: change.note,
      createdById: change.userId ?? null,
    },
  });
}

export async function getOnHand(tx: Tx, productId: string, warehouseId: string): Promise<number> {
  const level = await tx.stockLevel.findUnique({
    where: { productId_warehouseId: { productId, warehouseId } },
    select: { quantity: true },
  });
  return level ? Number(level.quantity) : 0;
}
