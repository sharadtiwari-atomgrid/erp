import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Shipments" };

export default async function B2cShipmentsPage() {
  await requireUser("b2cLogistics");
  return (
    <ComingSoon title="Shipments" division="B2C division · Logistics">
      Courier handover, AWB tracking, delivery and RTO.
    </ComingSoon>
  );
}
