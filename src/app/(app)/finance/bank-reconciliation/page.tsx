import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Bank reconciliation" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinanceBankReconciliationPage() {
  await requireUser("finance");
  return (
    <ComingSoon title="Bank reconciliation" division="Finance · Cash Management">
      Match bank statement lines with ledger entries and clear differences.
    </ComingSoon>
  );
}
