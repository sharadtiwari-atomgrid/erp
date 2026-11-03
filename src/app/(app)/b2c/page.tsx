import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "B2C overview" };

export default async function B2cPage() {
  await requireUser("b2cOrders");
  return (
    <ComingSoon title="B2C overview" division="B2C division · Order Management">
      Orders, revenue and fulfilment status for the B2C business at a glance.
    </ComingSoon>
  );
}
