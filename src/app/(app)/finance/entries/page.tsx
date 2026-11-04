import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "G/L entries" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinanceEntriesPage() {
  await requireUser("finance");
  return (
    <ComingSoon title="G/L entries" division="Finance · General Ledger">
      Every posted ledger entry with its source document, account, amount and dimensions.
    </ComingSoon>
  );
}
