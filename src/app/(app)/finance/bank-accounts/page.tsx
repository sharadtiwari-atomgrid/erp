import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Bank accounts" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinanceBankAccountsPage() {
  await requireUser("finance");
  return (
    <ComingSoon title="Bank accounts" division="Finance · Cash Management">
      Company bank and cash accounts with balances and statements.
    </ComingSoon>
  );
}
