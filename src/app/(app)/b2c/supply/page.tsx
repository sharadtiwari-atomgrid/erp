import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Replenishment" };

export default async function B2cSupplyPage() {
  await requireUser("b2cSupply");
  return (
    <ComingSoon title="Replenishment" division="B2C division · Supply">
      Stock cover and replenishment suggestions for B2C products.
    </ComingSoon>
  );
}
