import "server-only";
import { InsufficientStockError } from "@/lib/stock";

/** A business-rule failure raised inside a transaction and shown to the user as `{ error }`. */
export class WarehouseError extends Error {}

/**
 * Runs a write (usually a transaction) and turns expected failures into an
 * error message for the form. Anything else is rethrown.
 */
export async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    if (e instanceof WarehouseError || e instanceof InsufficientStockError) return { ok: false, error: e.message };
    throw e;
  }
}
