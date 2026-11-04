import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Asset register" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinanceFixedAssetsPage() {
  await requireUser("finance");
  return (
    <ComingSoon title="Asset register" division="Finance · Fixed Assets">
      Plant, machinery, vehicles and other assets with cost, location and status.
    </ComingSoon>
  );
}
