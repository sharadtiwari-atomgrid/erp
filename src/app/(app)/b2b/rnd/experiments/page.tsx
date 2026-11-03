import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Experiments" };

export default async function ExperimentsPage() {
  await requireUser("rnd");
  return (
    <ComingSoon title="Experiments" division="B2B division · R&D">
      A log of lab experiments for each R&D project, with procedure, observations and results.
    </ComingSoon>
  );
}
