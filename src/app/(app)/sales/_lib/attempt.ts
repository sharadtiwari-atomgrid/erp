import "server-only";
import { FinanceError } from "@/lib/finance/posting";
import { InsufficientStockError } from "@/lib/stock";
import { DocumentError } from "./documents";

/**
 * Runs a write (usually a transaction) and turns expected business-rule
 * failures into an error message for the form. Anything else is rethrown.
 */
export async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    if (e instanceof DocumentError || e instanceof InsufficientStockError || e instanceof FinanceError) return { ok: false, error: e.message };
    throw e;
  }
}
