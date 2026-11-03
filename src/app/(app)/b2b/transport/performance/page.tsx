import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { todayIso } from "@/lib/ops/dates";
import { loadTransporters, loadTransportJobs } from "../data";
import { PerformanceBoard } from "./performance-board";

export const metadata: Metadata = { title: "Transport performance" };

export default async function TransportPerformancePage() {
  await requireUser("transportOps");
  const [jobs, transporters] = await Promise.all([loadTransportJobs(), loadTransporters()]);
  return (
    <>
      <PageHeader
        title="Transport performance"
        description="How fast each transporter delivers, how often they're late and what it costs, their rates, and whether they sent the POD. Delivered shipments, live from Domestic MIS."
      />
      <PerformanceBoard jobs={jobs} transporterNames={transporters.map((t) => t.name)} today={todayIso()} />
    </>
  );
}
