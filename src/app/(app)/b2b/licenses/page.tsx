import type { Metadata } from "next";
import { ComingSoon } from "@/components/layout/coming-soon";
import { requireUser } from "@/lib/auth";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Licensing" };

export default async function B2bLicensesPage() {
  await requireUser("licensing");
  return (
    <ComingSoon title="Licensing" division="B2B division">
      Regulatory licences and registrations with expiry dates and renewal reminders.
    </ComingSoon>
  );
}
