import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { param } from "@/lib/forms";
import { todayIso } from "@/lib/ops/dates";
import { can } from "@/lib/permissions";
import { loadInward, loadOutward } from "@/lib/batch-inventory/server";
import { isAdmin, loadJobs, loadMasters } from "../_lib/server";
import { InwardSheet } from "./inward-sheet";

export const metadata: Metadata = { title: "Batch inward" };

export default async function InwardPage({ searchParams }: PageProps<"/b2b/inventory/inward">) {
  const user = await requireUser("batchInventory");
  const sp = await searchParams;
  const [inward, outward, masters, jobs] = await Promise.all([loadInward(), loadOutward(), loadMasters(), loadJobs()]);
  return (
    <>
      <PageHeader
        title="Batch inward"
        description="Material received into our warehouses — one line per batch. Outward Qty = the sheet's figure + dispatches entered in Batch outward; Instock Qty = Net Weight − Outward Qty; Warehouse Ageing = days since the inward date while stock remains."
      />
      <InwardSheet
        inward={inward}
        outward={outward.map((o) => ({ id: o.id, source: o.source, batchNo: o.batchNo, qty: o.qty, productName: o.productName, catalogueName: o.catalogueName }))}
        masters={masters}
        jobs={jobs}
        today={todayIso()}
        canEdit={can(user, "batchInventory", "edit")}
        isAdmin={isAdmin(user)}
        initialQ={param(sp, "q")}
      />
    </>
  );
}
