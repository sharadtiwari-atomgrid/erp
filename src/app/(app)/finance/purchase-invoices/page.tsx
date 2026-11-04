import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Purchase invoices" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinancePurchaseInvoicesPage() {
  await requireUser("finance");
  return (
    <ComingSoon title="Purchase invoices" division="Finance · Payables">
      Supplier bills matched to purchase orders and goods receipts, with input GST.
    </ComingSoon>
  );
}
