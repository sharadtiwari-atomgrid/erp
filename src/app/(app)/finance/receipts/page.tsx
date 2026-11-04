import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Cash receipts" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinanceReceiptsPage() {
  await requireUser("finance");
  return (
    <ComingSoon title="Cash receipts" division="Finance · Receivables">
      Customer receipts applied against open invoices, posted to bank or cash.
    </ComingSoon>
  );
}
