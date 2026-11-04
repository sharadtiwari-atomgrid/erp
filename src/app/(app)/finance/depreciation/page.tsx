import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Depreciation" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinanceDepreciationPage() {
  await requireUser("finance");
  return (
    <ComingSoon title="Depreciation" division="Finance · Fixed Assets">
      Depreciation schedules and runs, posted to the general ledger.
    </ComingSoon>
  );
}
