import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Payments & refunds" };

export default async function B2cPaymentsPage() {
  await requireUser("b2cPayments");
  return (
    <ComingSoon title="Payments & refunds" division="B2C division · Payments">
      Prepaid and COD payments, refunds, COD remittances and reconciliation.
    </ComingSoon>
  );
}
