import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { todayIso } from "@/lib/ops/dates";
import { loadTransporters, loadTransportJobs } from "../data";
import { PayablesBoard } from "./payables-board";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Transport payables" };

export default async function TransportPayablesPage() {
  await requireUser("transportOps");
  const [jobs, transporters] = await Promise.all([loadTransportJobs(), loadTransporters()]);
  return (
    <>
      <PageHeader
        title="Transport payables"
        description="How much of the Logistics Cost (AG to Pay) is still unpaid to each transporter, and how old it is. Live from Domestic MIS: every delivered shipment with an AG to Pay amount whose Transport Payment Status isn't Paid (“To pay” and “Sx to pay” shipments are excluded: the customer or supplier pays)."
      />
      <PayablesBoard jobs={jobs} transporterNames={transporters.map((t) => t.name)} today={todayIso()} />
    </>
  );
}
