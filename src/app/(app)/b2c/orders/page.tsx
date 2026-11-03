import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Orders" };

export default async function B2cOrdersPage() {
  await requireUser("b2cOrders");
  return (
    <ComingSoon title="Orders" division="B2C division · Order Management">
      Channel orders from the website, marketplaces and WhatsApp, from placement to delivery.
    </ComingSoon>
  );
}
