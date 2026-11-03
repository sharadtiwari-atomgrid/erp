import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { param } from "@/lib/forms";
import { todayIso } from "@/lib/ops/dates";
import { can } from "@/lib/permissions";
import { loadInward, loadOutward } from "@/lib/batch-inventory/server";
import { isAdmin, loadJobs, loadMasters } from "../_lib/server";
import { OutwardSheet } from "./outward-sheet";

export const metadata: Metadata = { title: "Batch outward" };

export default async function OutwardPage({ searchParams }: PageProps<"/b2b/inventory/outward">) {
  const user = await requireUser("batchInventory");
  const sp = await searchParams;
  const [inward, outward, masters, jobs] = await Promise.all([loadInward(), loadOutward(), loadMasters(), loadJobs()]);
  return (
    <>
      <PageHeader
        title="Batch outward"
        description="Material dispatched from our warehouses — one line per batch. Lines entered here come off their batch's stock; lines imported from the old sheet are already counted in the Inward sheet's Outward Qty."
      />
      <OutwardSheet
        inward={inward}
        outward={outward}
        customers={masters.customers}
        jobs={jobs}
        today={todayIso()}
        canEdit={can(user, "batchInventory", "edit")}
        isAdmin={isAdmin(user)}
        initialQ={param(sp, "q")}
      />
    </>
  );
}
