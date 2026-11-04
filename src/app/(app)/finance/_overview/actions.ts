"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { syncSalesLedger } from "@/lib/finance/documents";
import { FinanceError } from "@/lib/finance/posting";
import type { ActionState } from "@/lib/forms";

/** Posts issued sales invoices and payments that are not in the ledger yet. Idempotent. */
export async function postExistingSalesDocuments(): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  try {
    const posted = await syncSalesLedger(user.id);
    revalidatePath("/finance");
    return posted === 0
      ? { success: "Nothing new to post: every issued invoice and payment is already in the ledger." }
      : { success: `Posted ${posted} sales ${posted === 1 ? "document" : "documents"} to the ledger.` };
  } catch (e) {
    if (e instanceof FinanceError) return { error: `Stopped: ${e.message} Documents posted before this one are kept.` };
    throw e;
  }
}
