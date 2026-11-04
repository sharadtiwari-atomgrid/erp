import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Finance overview" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinancePage() {
  await requireUser("finance");
  return (
    <ComingSoon title="Finance overview" division="Finance">
      Cash position, receivables, payables, profit this month and items needing attention.
    </ComingSoon>
  );
}
