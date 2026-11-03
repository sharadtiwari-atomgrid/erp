import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Certificates" };

export default async function B2bCertificatesPage() {
  await requireUser("certificates");
  return (
    <ComingSoon title="Certificates" division="B2B division">
      A library of COAs, MSDS, ISO/GMP certificates and test reports, with validity dates.
    </ComingSoon>
  );
}
