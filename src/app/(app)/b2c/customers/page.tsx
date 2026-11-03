import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Customers" };

export default async function B2cCustomersPage() {
  await requireUser("b2cCustomers");
  return (
    <ComingSoon title="Customers" division="B2C division · Customer Management">
      B2C customer profiles, addresses and order history.
    </ComingSoon>
  );
}
