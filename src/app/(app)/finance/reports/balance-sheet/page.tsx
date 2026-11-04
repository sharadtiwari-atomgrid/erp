import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Balance sheet" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinanceReportsBalanceSheetPage() {
  await requireUser("finance");
  return (
    <ComingSoon title="Balance sheet" division="Finance · Reports">
      Assets, liabilities and equity as on a date, in Schedule III format.
    </ComingSoon>
  );
}
