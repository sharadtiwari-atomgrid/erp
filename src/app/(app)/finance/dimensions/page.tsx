import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Dimensions" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinanceDimensionsPage() {
  await requireUser("finance");
  return (
    <ComingSoon title="Dimensions" division="Finance · General Ledger">
      Analysis dimensions such as division, department, branch and project for tagging entries.
    </ComingSoon>
  );
}
