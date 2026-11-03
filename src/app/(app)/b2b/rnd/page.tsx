import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "R&D projects" };

export default async function RdPage() {
  await requireUser("rnd");
  return (
    <ComingSoon title="R&D projects" division="B2B division · R&D">
      Development projects from idea to commercial launch: new molecules, formulations and process improvements.
    </ComingSoon>
  );
}
