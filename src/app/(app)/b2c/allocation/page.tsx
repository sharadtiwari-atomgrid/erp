import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Demand & allocation" };

export default async function B2cAllocationPage() {
  await requireUser("b2cAllocation");
  return (
    <ComingSoon title="Demand & allocation" division="B2C division · Demand & Allocation">
      Open demand by product and allocation of available stock to orders.
    </ComingSoon>
  );
}
