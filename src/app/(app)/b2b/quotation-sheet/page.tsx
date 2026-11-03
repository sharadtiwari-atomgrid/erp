import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { dayFromIso, formatDmy, todayIso } from "@/lib/ops/dates";
import { normalizeBids, stagesOf } from "./_lib/board";
import { prepareBoard } from "./_lib/prepare";
import { QuotationBoard, type BoardRow } from "./board";

export const metadata: Metadata = { title: "Quotation sheet (D-0)" };

export default async function QuotationSheetPage() {
  const user = await requireUser("b2bOrders");
  const today = todayIso();
  const jobs = await db.misJob.findMany({ where: { deletedAt: null, actualEtd: dayFromIso(today) }, orderBy: { jobNo: "asc" } });
  const [byJob, transporters] = await Promise.all([
    prepareBoard(db, jobs, today, user.id),
    db.contact.findMany({ where: { roles: { has: "TRANSPORTER" }, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const rows: BoardRow[] = [];
  for (const j of jobs) {
    const q = byJob.get(j.jobNo.trim());
    if (!q || rows.some((r) => r.id === q.id)) continue;
    rows.push({
      id: q.id,
      misJobId: j.id,
      jobNo: q.jobNo,
      distance: q.distance ?? "",
      supplier: q.supplier ?? "",
      pickupAddress: q.pickupAddress ?? "",
      customer: q.customer ?? "",
      deliveryAddress: q.deliveryAddress ?? "",
      netWeight: q.netWeight ?? "",
      grossWt: q.grossWt ?? "",
      packing: q.packing ?? "",
      taxableValue: q.taxableValue ?? "",
      paymentTerms: q.paymentTerms ?? "",
      agDemandPoc: q.agDemandPoc ?? "",
      materialReadiness: q.materialReadiness ?? "",
      materialReadyTime: q.materialReadyTime ?? "",
      vehicleStatus: q.vehicleStatus ?? "",
      vehicleStages: stagesOf(q),
      vehicleArrangements: q.vehicleArrangements ?? "",
      vehicleDetails: q.vehicleDetails ?? "",
      vehicleType: q.vehicleType ?? "",
      approvedTx: q.approvedTx ?? "",
      bids: normalizeBids(q.bids),
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Quotation sheet (D-0)"
        description="Live D-day board: jobs dispatching today (Actual ETD in Domestic MIS) load here automatically. Edit any cell; changes save on their own."
      />
      <QuotationBoard rows={rows} transporters={transporters.map((t) => t.name)} canEdit={can(user, "b2bOrders", "edit")} today={formatDmy(today)} />
    </div>
  );
}
