import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { param } from "@/lib/forms";
import { formatDmy, todayIso } from "@/lib/ops/dates";
import { can } from "@/lib/permissions";
import { loadInward, loadOutward, loadWarehouseMis } from "@/lib/batch-inventory/server";
import { StockView } from "./stock-view";

export const metadata: Metadata = { title: "Batch stock in hand" };

export default async function StockPage({ searchParams }: PageProps<"/b2b/inventory/stock">) {
  const user = await requireUser("batchInventory");
  const sp = await searchParams;
  const today = todayIso();
  const [inward, outward, mis] = await Promise.all([loadInward(), loadOutward(), loadWarehouseMis()]);
  return (
    <>
      <PageHeader
        title="Batch stock in hand"
        description={`As of ${formatDmy(today)}, worked out from Batch inward and Batch outward — nothing is entered here. Stock = total received − total dispatched, per material. A separate batch-level ledger: it does not change the ERP's stock levels.`}
      />
      <StockView
        inward={inward}
        outward={outward}
        today={today}
        canEdit={can(user, "batchInventory", "edit")}
        warehouseMis={mis ? { fileName: mis.fileName, countDate: mis.countDate, uploadedAt: mis.uploadedAt, lines: mis.rows.length } : null}
        initialQ={param(sp, "q")}
      />
    </>
  );
}
