import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { todayIso } from "@/lib/ops/dates";
import { loadMisRows } from "../_lib/load";
import { dmy } from "../_lib/rows";
import { JobLink, MisStatusBadge, WideTable, dash, kg } from "../_lib/ui";
import { plannedShipments } from "../_lib/views";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Planned shipments" };

export default async function PlannedPage() {
  await requireUser("b2bReports");
  const today = todayIso();
  const rows = plannedShipments(await loadMisRows());

  return (
    <div className="space-y-5">
      <PageHeader
        title="Upcoming shipments"
        description={`${rows.length} upcoming shipment${rows.length === 1 ? "" : "s"} (dispatch plan, Fresh PO and on hold) · excludes delivered, cancelled and in transit.`}
      />
      <Card>
        <WideTable>
          <thead>
            <tr>
              <th>Job No.</th>
              <th>Customer</th>
              <th>Supplier</th>
              <th>Product</th>
              <th className="text-right">Qty (kg)</th>
              <th>Planned ETD</th>
              <th>Planned ETA</th>
              <th>Status</th>
              <th>Payment term</th>
              <th>Payment status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-10 text-center text-ink-faint">
                  No upcoming shipments — everything is in transit, delivered or cancelled.
                </td>
              </tr>
            ) : (
              rows.map((e) => (
                <tr key={e.id}>
                  <td>
                    <JobLink id={e.id} jobNo={e.jobNo} />
                  </td>
                  <td>{dash(e.customer)}</td>
                  <td>{dash(e.supplier)}</td>
                  <td>{dash(e.productName)}</td>
                  <td className="text-right tabular-nums">{kg(e.quantityKgs)}</td>
                  <td className={cn("tabular-nums", e.plannedEtd && e.plannedEtd < today && "font-semibold text-red-600")}>{dash(dmy(e.plannedEtd))}</td>
                  <td className="tabular-nums">{dash(dmy(e.plannedEta))}</td>
                  <td>
                    <MisStatusBadge status={e.status} />
                  </td>
                  <td>{dash(e.logisticsPaymentTerm)}</td>
                  <td>{dash(e.transportPaymentStatus)}</td>
                </tr>
              ))
            )}
          </tbody>
        </WideTable>
      </Card>
    </div>
  );
}
