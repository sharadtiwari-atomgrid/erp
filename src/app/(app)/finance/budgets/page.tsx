import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Budgets" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinanceBudgetsPage() {
  await requireUser("finance");
  return (
    <ComingSoon title="Budgets" division="Finance · General Ledger">
      Budgets by account, period and dimension, compared with actuals.
    </ComingSoon>
  );
}
