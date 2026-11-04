import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Chart of accounts" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinanceAccountsPage() {
  await requireUser("finance");
  return (
    <ComingSoon title="Chart of accounts" division="Finance · General Ledger">
      Ledger accounts grouped as assets, liabilities, equity, income and expenses, with balances.
    </ComingSoon>
  );
}
