import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Trial balance" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinanceReportsTrialBalancePage() {
  await requireUser("finance");
  return (
    <ComingSoon title="Trial balance" division="Finance · Reports">
      Debit and credit balances of every account for a period.
    </ComingSoon>
  );
}
