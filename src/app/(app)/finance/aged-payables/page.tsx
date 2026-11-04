import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Aged payables" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinanceAgedPayablesPage() {
  await requireUser("finance");
  return (
    <ComingSoon title="Aged payables" division="Finance · Payables">
      Amounts owed to suppliers by age bucket and due date.
    </ComingSoon>
  );
}
