import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "GST returns" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinanceGstReturnsPage() {
  await requireUser("finance");
  return (
    <ComingSoon title="GST returns" division="Finance · Tax (GST)">
      GSTR-1 and GSTR-3B summaries prepared from posted sales and purchases.
    </ComingSoon>
  );
}
