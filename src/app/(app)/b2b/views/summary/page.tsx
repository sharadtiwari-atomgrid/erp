import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { todayIso } from "@/lib/ops/dates";
import { loadFpoRows, loadMisRows } from "../_lib/load";
import { dmy, hasDoc } from "../_lib/rows";
import { JobLink, Tag, Tile, WideTable, dash, kg } from "../_lib/ui";
import { shipmentsSummary, type TimelineRow } from "../_lib/views";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Shipments summary" };

export default async function ShipmentsSummaryPage() {
  await requireUser("b2bReports");
  const today = todayIso();
  const [mis, fpo] = await Promise.all([loadMisRows(), loadFpoRows()]);
  const d = shipmentsSummary(mis, fpo, today);

  return (
    <div className="space-y-5">
      <PageHeader title="Shipments summary" description="Dispatch plan and in-transit timelines per Logistics PoC, live from Domestic MIS." />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Fresh PO — to be planned" value={d.toPlan} href="/b2b/fresh-po" />
        <Tile label="Long Hold PO — on hold" value={d.longHold} href="/b2b/long-hold" tone={d.longHold ? "warn" : "default"} />
        <Tile label="Pickup ×2 + In transit" value={d.pickupX2} sub="(dispatch plan × 2) + in transit" />
        <Tile label="Delivered in last 4 days" value={d.last4} href="/b2b/views/delivered" />
      </div>

      <Card>
        <CardHeader
          title="Domestic Shipments Summary"
          description={`Grouped by Logistics PoC · “Pickup ×2 + In transit” = (Dispatch Plan × 2) + In Transit · ${formatDateTime(new Date())}`}
        />
        <CardBody className="space-y-5">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">
              Dispatch Plan :- {d.dispatchCount} &nbsp;|&nbsp; Pickup Timelines
            </h3>
            <TimelineTable
              rows={d.pickup.rows}
              total={d.pickup.total}
              cols={[
                ["today", "Today or Before"],
                ["tom", "Tomorrow"],
                ["post", "Post Tomorrow"],
                ["na", "Not Assigned"],
                ["actToday", "Picked Today"],
                ["notActToday", "Not Picked Today"],
              ]}
            />
          </section>

          <div className="inline-flex flex-col rounded-lg border border-line bg-muted px-4 py-3">
            <span className="text-xs font-semibold text-ink-soft">Pickup ×2 + In transit</span>
            <span className="text-2xl font-semibold tabular-nums text-ink">{d.pickupX2}</span>
          </div>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">
              In transit :- {d.transitCount} &nbsp;|&nbsp; Delivered Timelines
            </h3>
            <TimelineTable
              rows={d.delivery.rows}
              total={d.delivery.total}
              cols={[
                ["today", "Today or Before"],
                ["tom", "Tomorrow"],
                ["post", "Post Tomorrow"],
                ["na", "ETA NA"],
                ["actToday", "Delivered Today"],
                ["notActToday", "Not delivered Today"],
              ]}
            />
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">Delivered in the last 4 days: {d.last4}</h3>
            {d.last4Rows.length > 0 && (
              <WideTable>
                <thead>
                  <tr>
                    <th>Job No.</th>
                    <th>Customer</th>
                    <th>Product</th>
                    <th className="text-right">Qty (kg)</th>
                    <th>Delivered on</th>
                    <th>Logistics PoC</th>
                    <th>POD</th>
                  </tr>
                </thead>
                <tbody>
                  {d.last4Rows.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <JobLink id={e.id} jobNo={e.jobNo} />
                      </td>
                      <td>{dash(e.customer)}</td>
                      <td>{dash(e.productName)}</td>
                      <td className="text-right tabular-nums">{kg(e.quantityKgs)}</td>
                      <td className="tabular-nums">{dmy(e.actualEta || e.plannedEta)}</td>
                      <td>{dash(e.logisticsPoc)}</td>
                      <td>{hasDoc(e, "pod") ? <Tag tone="good">✓</Tag> : <Tag tone="warn">Missing</Tag>}</td>
                    </tr>
                  ))}
                </tbody>
              </WideTable>
            )}
          </section>
        </CardBody>
      </Card>
    </div>
  );
}

type Col = Exclude<keyof TimelineRow, "poc" | "shipments">;

function TimelineTable({ rows, total, cols }: { rows: TimelineRow[]; total: TimelineRow; cols: Array<[Col, string]> }) {
  const cell = (v: number, k: string) => (
    <td key={k} className={cn("text-center tabular-nums", !v && "text-ink-faint")}>
      {v || "—"}
    </td>
  );
  const line = (r: TimelineRow, isTotal: boolean) => (
    <tr key={r.poc} className={cn(isTotal && "font-semibold [&_td]:bg-muted")}>
      <td>{isTotal ? "Total" : r.poc}</td>
      {cell(r.shipments, "shipments")}
      {cols.map(([k]) => cell(r[k], k))}
    </tr>
  );
  return (
    <WideTable>
      <thead>
        <tr>
          <th>PoC</th>
          <th className="text-center">Shipments</th>
          {cols.map(([k, label]) => (
            <th key={k} className="text-center">
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={cols.length + 2} className="text-ink-faint">
              No shipments in this group.
            </td>
          </tr>
        ) : (
          <>
            {rows.map((r) => line(r, false))}
            {line(total, true)}
          </>
        )}
      </tbody>
    </WideTable>
  );
}
