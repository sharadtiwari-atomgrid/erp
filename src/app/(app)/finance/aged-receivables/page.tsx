import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Aged receivables" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinanceAgedReceivablesPage() {
  await requireUser("finance");
  return (
    <ComingSoon title="Aged receivables" division="Finance · Receivables">
      Outstanding customer balances by age bucket, with overdue follow-up.
    </ComingSoon>
  );
}
