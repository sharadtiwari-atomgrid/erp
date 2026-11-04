import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Currencies" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinanceCurrenciesPage() {
  await requireUser("finance");
  return (
    <ComingSoon title="Currencies" division="Finance · Setup">
      Foreign currencies and exchange rates for import and export transactions.
    </ComingSoon>
  );
}
