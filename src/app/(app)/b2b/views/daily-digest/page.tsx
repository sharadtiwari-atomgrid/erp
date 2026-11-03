import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { addDaysIso, formatDmy, todayIso } from "@/lib/ops/dates";
import { loadInventoryReport } from "@/lib/batch-inventory/server";
import { shipmentReports } from "../_lib/digest";
import { loadFpoRows, loadMisRows } from "../_lib/load";
import { DigestBox, DigestToolbar, WarehouseUpload } from "./digest-client";
import { DeliveredSheet, InventorySheet, PipelineSheet, SHEET_CSS, SummarySheet, TransitSheet, UpcomingSheet } from "./sheets";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Daily digest" };

/** "dd/mm/yyyy hh:mm:ss" in IST. */
function istStamp(now: Date) {
  const t = new Date(now.getTime() + 330 * 60_000).toISOString();
  return `${formatDmy(t.slice(0, 10))} ${t.slice(11, 19)}`;
}

export default async function DailyDigestPage({ searchParams }: PageProps<"/b2b/views/daily-digest">) {
  const user = await requireUser("b2bReports");
  const sp = await searchParams;
  const today = todayIso();
  const asked = typeof sp.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : today;
  const day = asked > today ? today : asked;

  const seesPos = can(user, "b2bOrders");
  const seesStock = can(user, "batchInventory");
  const [mis, fpo, inv] = await Promise.all([loadMisRows(), seesPos ? loadFpoRows() : Promise.resolve([]), seesStock ? loadInventoryReport(day) : Promise.resolve(null)]);
  const ship = shipmentReports({ mis, fpo, day });
  const when = day === today ? istStamp(new Date()) : `EOD ${formatDmy(day)}`;
  const wh = inv?.warehouseMis ?? null;

  return (
    <div className="space-y-5">
      <style>{SHEET_CSS}</style>
      <PageHeader
        title="Daily digest"
        description="The day's reports for the team group, live from the ERP. Copy each one as an image and paste it into the chat, or download them all."
      />
      <DigestToolbar day={day} today={today} />

      <div className="space-y-5">
        {inv ? (
          <DigestBox
            id="inventory-report"
            label="Inventory report"
            day={day}
            extra={
              <span className="inline-flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
                {wh ? (
                  <>
                    Warehouse MIS: {wh.fileName} · stock count {wh.countDate ? formatDmy(wh.countDate) : "—"}
                    {wh.countDate && wh.countDate < addDaysIso(day, -1) && <b className="text-red-600">(old — upload today&apos;s)</b>}
                  </>
                ) : (
                  <b className="text-red-600">No warehouse MIS yet</b>
                )}
                {inv.mismatches > 0 && wh && <b className="text-red-600">· {inv.mismatches} not matching</b>}
                {can(user, "batchInventory", "edit") && <WarehouseUpload />}
              </span>
            }
          >
            <InventorySheet inv={inv} day={day} hasWh={!!wh} />
          </DigestBox>
        ) : (
          <p className="text-sm text-ink-soft">The inventory report needs access to the batch inventory registers.</p>
        )}
        <DigestBox id="shipments-summary" label="Shipments summary" day={day}>
          <SummarySheet s={ship.summary} when={when} />
        </DigestBox>
        <DigestBox id="upcoming-dispatch" label="Upcoming dispatch plans" day={day}>
          <UpcomingSheet rows={ship.upcoming} when={when} day={day} />
        </DigestBox>
        <DigestBox id="in-transit" label="In transit" day={day}>
          <TransitSheet rows={ship.transit} when={when} day={day} />
        </DigestBox>
        {seesPos && (
          <DigestBox id="fresh-po-pipeline" label="Fresh PO pipeline" day={day}>
            <PipelineSheet rows={ship.pipeline} when={when} title="Fresh PO - PIPELINE" />
          </DigestBox>
        )}
        {seesPos && (
          <DigestBox id="long-hold-po" label="Long Hold PO" day={day}>
            <PipelineSheet rows={ship.longHold} when={when} title="Long Hold PO" hold />
          </DigestBox>
        )}
        <DigestBox id="delivered-last-4-days" label="Delivered last 4 days" day={day}>
          <DeliveredSheet rows={ship.delivered} when={when} />
        </DigestBox>
      </div>
    </div>
  );
}
