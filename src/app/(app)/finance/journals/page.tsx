import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "General journals" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinanceJournalsPage() {
  await requireUser("finance");
  return (
    <ComingSoon title="General journals" division="Finance · General Ledger">
      Manual journal vouchers with balanced debit and credit lines, posted to the general ledger.
    </ComingSoon>
  );
}
