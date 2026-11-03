import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "QC Sampling" };

export default async function B2bQcPage() {
  await requireUser("qcSampling");
  return (
    <ComingSoon title="QC Sampling" division="B2B division">
      Incoming, outgoing and retention samples, with test results checked against specification.
    </ComingSoon>
  );
}
