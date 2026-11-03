import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Returns & RTO" };

export default async function B2cReturnsPage() {
  await requireUser("b2cReturns");
  return (
    <ComingSoon title="Returns & RTO" division="B2C division · Returns">
      Customer returns and RTOs: pickup, inspection, restock and refunds.
    </ComingSoon>
  );
}
