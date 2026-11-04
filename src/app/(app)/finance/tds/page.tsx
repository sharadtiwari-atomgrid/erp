import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "TDS / TCS" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinanceTdsPage() {
  await requireUser("finance");
  return (
    <ComingSoon title="TDS / TCS" division="Finance · Tax (GST)">
      Tax deducted or collected at source, with challans and quarterly returns.
    </ComingSoon>
  );
}
