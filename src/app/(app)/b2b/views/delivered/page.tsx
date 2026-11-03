import type { Metadata } from "next";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { todayIso } from "@/lib/ops/dates";
import { loadMisRows } from "../_lib/load";
import { dmy, hasDoc } from "../_lib/rows";
import { JobLink, Tag, Tile, WideTable, dash, kg } from "../_lib/ui";
import { deliveredShipments, deliveredStats, monthLabel, type DeliveredShipment } from "../_lib/views";

export const metadata: Metadata = { title: "Delivered shipments" };

const OnTime = ({ slip, long }: { slip: number | null; long?: boolean }) =>
  slip === null ? <Tag tone="muted">—</Tag> : slip <= 0 ? <Tag tone="good">On time</Tag> : <Tag tone="bad">{long ? `Late by ${slip}d` : `Late ${slip}d`}</Tag>;
const Pod = ({ e }: { e: DeliveredShipment }) => (hasDoc(e, "pod") ? <Tag tone="good">✓</Tag> : <Tag tone="muted">—</Tag>);

export default async function DeliveredPage({ searchParams }: PageProps<"/b2b/views/delivered">) {
  await requireUser("b2bReports");
  const sp = await searchParams;
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : "";
  const all = deliveredShipments(await loadMisRows());
  const s = deliveredStats(all, month, todayIso());

  return (
    <div className="space-y-5">
      <PageHeader title="Delivered shipments" description="All shipments delivered to date, live from Domestic MIS." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label={`Delivered ${month ? monthLabel(month) : "(all)"}`} value={s.filtered.length} />
        <Tile label="On-time vs planned ETA" value={s.onTimePct === null ? "—" : `${s.onTimePct}%`} tone="good" />
        <Tile label="POD received" value={`${s.podPct}%`} tone="teal" />
        <Tile label="Delivered in last 4 days" value={s.last4.length} tone={s.last4.length ? "warn" : "default"} />
      </div>

      <Card>
        <CardHeader title="Delivered in the last 4 days" />
        <WideTable>
          <thead>
            <tr>
              <th>Job No.</th>
              <th>Customer</th>
              <th>Product</th>
              <th className="text-right">Qty (kg)</th>
              <th>Delivered on</th>
              <th>On-time</th>
              <th>Transit</th>
              <th>POD</th>
            </tr>
          </thead>
          <tbody>
            {s.last4.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-ink-faint">
                  Nothing delivered in the last 4 days.
                </td>
              </tr>
            ) : (
              s.last4.map((e) => (
                <tr key={e.id}>
                  <td>
                    <JobLink id={e.id} jobNo={e.jobNo} />
                  </td>
                  <td>{dash(e.customer)}</td>
                  <td>{dash(e.productName)}</td>
                  <td className="text-right tabular-nums">{kg(e.quantityKgs)}</td>
                  <td className="tabular-nums">{dash(dmy(e.deliveredOn))}</td>
                  <td>
                    <OnTime slip={e.slip} />
                  </td>
                  <td className="tabular-nums">{e.transit === null ? "—" : `${e.transit}d`}</td>
                  <td>
                    <Pod e={e} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </WideTable>
      </Card>

      <Card>
        <CardHeader
          title="All delivered"
          description={`${s.filtered.length} shipments`}
          actions={
            <form className="flex items-center gap-2">
              <Select name="month" defaultValue={month} aria-label="Month" className="w-auto">
                <option value="">All months</option>
                {s.months.map((k) => (
                  <option key={k} value={k}>
                    {monthLabel(k)}
                  </option>
                ))}
              </Select>
              <button type="submit" className={buttonClass("secondary", "sm")}>
                Show
              </button>
            </form>
          }
        />
        <WideTable>
          <thead>
            <tr>
              <th>Job No.</th>
              <th>Customer</th>
              <th>Supplier</th>
              <th>Product</th>
              <th className="text-right">Qty (kg)</th>
              <th>Planned ETA</th>
              <th>Delivered on</th>
              <th>On-time</th>
              <th>Transit</th>
              <th>Transporter</th>
              <th>POD</th>
            </tr>
          </thead>
          <tbody>
            {s.filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-8 text-center text-ink-faint">
                  No delivered shipments{month ? ` in ${monthLabel(month)}` : " yet"}.
                </td>
              </tr>
            ) : (
              s.filtered.map((e) => (
                <tr key={e.id}>
                  <td>
                    <JobLink id={e.id} jobNo={e.jobNo} />
                  </td>
                  <td>{dash(e.customer)}</td>
                  <td>{dash(e.supplier)}</td>
                  <td>{dash(e.productName)}</td>
                  <td className="text-right tabular-nums">{kg(e.quantityKgs)}</td>
                  <td className="tabular-nums">{dash(dmy(e.plannedEta))}</td>
                  <td className="tabular-nums">{dash(dmy(e.deliveredOn))}</td>
                  <td>
                    <OnTime slip={e.slip} long />
                  </td>
                  <td className="tabular-nums">{e.transit === null ? "—" : `${e.transit}d`}</td>
                  <td>{dash(e.transporterDetails)}</td>
                  <td>
                    <Pod e={e} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </WideTable>
      </Card>
    </div>
  );
}
