import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Vendor payments" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinanceVendorPaymentsPage() {
  await requireUser("finance");
  return (
    <ComingSoon title="Vendor payments" division="Finance · Payables">
      Payments to suppliers and transporters, applied against open bills.
    </ComingSoon>
  );
}
