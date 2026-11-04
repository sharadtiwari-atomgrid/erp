import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Posting groups" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinancePostingGroupsPage() {
  await requireUser("finance");
  return (
    <ComingSoon title="Posting groups" division="Finance · Setup">
      Rules that map customers, suppliers, items and taxes to ledger accounts.
    </ComingSoon>
  );
}
