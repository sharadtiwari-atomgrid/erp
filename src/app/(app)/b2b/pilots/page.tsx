import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Pilot runs" };

export default async function PilotsPage() {
  await requireUser("pilots");
  return (
    <ComingSoon title="Pilot runs" division="B2B division · Pilots">
      Pilot batches at plants, job workers or customer sites, with yield, cost and the approval decision.
    </ComingSoon>
  );
}
