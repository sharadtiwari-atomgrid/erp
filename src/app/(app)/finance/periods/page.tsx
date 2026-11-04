import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Accounting periods" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinancePeriodsPage() {
  await requireUser("finance");
  return (
    <ComingSoon title="Accounting periods" division="Finance · General Ledger">
      Financial years and monthly periods, with period closing and year-end closing.
    </ComingSoon>
  );
}
