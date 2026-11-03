import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { loadPlaces, loadTransporters, loadTransportJobs } from "../data";
import { Finder } from "./finder";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Transport finder" };

export default async function TransportFinderPage() {
  await requireUser("transportOps");
  const [jobs, transporters, places] = await Promise.all([loadTransportJobs(), loadTransporters(), loadPlaces()]);
  return (
    <>
      <PageHeader
        title="Transport finder"
        description="Who to call for a route: ranked from our own shipment history (live from Domestic MIS), plus public network leads."
      />
      <Finder jobs={jobs} transporters={transporters} places={places} />
    </>
  );
}
