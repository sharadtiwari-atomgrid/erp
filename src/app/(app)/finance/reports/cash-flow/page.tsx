import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Cash flow statement" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinanceReportsCashFlowPage() {
  await requireUser("finance");
  return (
    <ComingSoon title="Cash flow statement" division="Finance · Reports">
      Cash from operating, investing and financing activities for a period.
    </ComingSoon>
  );
}
