import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Cash flow forecast" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinanceCashFlowForecastPage() {
  await requireUser("finance");
  return (
    <ComingSoon title="Cash flow forecast" division="Finance · Cash Management">
      Expected inflows and outflows from open invoices, bills and orders.
    </ComingSoon>
  );
}
