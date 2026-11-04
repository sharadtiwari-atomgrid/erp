import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Profit & loss" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinanceReportsProfitAndLossPage() {
  await requireUser("finance");
  return (
    <ComingSoon title="Profit & loss" division="Finance · Reports">
      Income and expenses for a period, by division and department.
    </ComingSoon>
  );
}
