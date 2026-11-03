/**
 * The daily digest's report sheets, laid out (and coloured) like the Google
 * Sheets they replace. Plain markup, so they render on the server and are
 * captured as images by html-to-image in the browser.
 */
import type { ReactNode } from "react";
import { formatDmy } from "@/lib/ops/dates";
import type { InventoryReport } from "@/lib/batch-inventory";
import { lateBy, type PipelineRow, type ShipmentSummary } from "../_lib/digest";
import { dmy, istDay, type MisRow } from "../_lib/rows";

const d = (v: string | null | undefined) => dmy(v);
const q = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(Math.round(v * 1000) / 1000));
const z = (n: number | null | undefined) => (n ? q(n) : "");

const Pill = ({ v, tone }: { v: string | null | undefined; tone?: string }) => (v ? <span className={`rp-pill ${tone ?? ""}`}>{v}</span> : null);
const payTone = (v: string | null) => (/^\s*ag to pay/i.test(v ?? "") ? "g" : /to pay/i.test(v ?? "") ? "r" : "");
const PayPill = ({ v }: { v: string | null }) => <Pill v={v} tone={payTone(v)} />;
const Files = ({ names }: { names: string[] }) =>
  names.length ? (
    <span className="rp-files">
      {names.map((n, i) => (
        <span key={i}>📄 {n}</span>
      ))}
    </span>
  ) : null;
const lateTone = (n: number | null) => (n === null || n <= 0 ? "" : n === 1 ? "c-yel" : n <= 4 ? "c-pink" : "c-red");
const oldPo = (poDate: string, day: string) => {
  const age = poDate ? (Date.parse(day) - Date.parse(poDate)) / 864e5 : 0;
  return age > 10 ? "c-pink" : "";
};
const TH = ({ c, children }: { c?: string; children: ReactNode }) => <th className={c ?? ""}>{children}</th>;

export function InventorySheet({ inv, day, hasWh }: { inv: InventoryReport; day: string; hasWh: boolean }) {
  const t = inv.totals;
  return (
    <table className="rp-t rp-inv">
      <thead>
        <tr>
          <th colSpan={9} className="h-orange rp-title">
            Inventory Report Date EOD Till {formatDmy(day)}
          </th>
        </tr>
        <tr>
          <th className="h-green l">AG Warehouse (Panoli)</th>
          <th colSpan={3} className="h-yel">
            AG MIS sheet - Overall Summary Till Date (QTY)
          </th>
          <th colSpan={2} className="h-grey">
            Shipments on {formatDmy(day)}
          </th>
          <th colSpan={3} className="h-yel">
            MIS Report Panoli - From Warehouse
          </th>
        </tr>
        <tr className="rp-sub">
          <th className="l">Product Name</th>
          <th>
            <Pill v="Inbound" tone="g" />
          </th>
          <th>
            <Pill v="Outbound" tone="r" />
          </th>
          <th>Instock</th>
          <th>
            <Pill v="Inbound" tone="g" />
          </th>
          <th>
            <Pill v="Outbound" tone="r" />
          </th>
          <th>
            <Pill v="Inbound" tone="g" />
          </th>
          <th>
            <Pill v="Outbound" tone="r" />
          </th>
          <th>Instock</th>
        </tr>
      </thead>
      <tbody>
        {inv.rows.map((r) => (
          <tr key={r.material}>
            <td className="l">{r.material}</td>
            <td>{z(r.crm.in)}</td>
            <td>{z(r.crm.out)}</td>
            <td>{q(r.crm.stock)}</td>
            <td>{z(r.day.in)}</td>
            <td>{z(r.day.out)}</td>
            {hasWh ? (
              <>
                <td className={r.diff.in ? "c-bad" : ""}>{r.wh ? z(r.wh.in) : ""}</td>
                <td className={r.diff.out ? "c-bad" : ""}>{r.wh ? z(r.wh.out) : ""}</td>
                <td className={r.diff.stock ? "c-bad" : ""}>{r.wh ? q(r.wh.stock) : "—"}</td>
              </>
            ) : (
              <td colSpan={3} className="rp-muted">
                —
              </td>
            )}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td className="l">Total</td>
          <td>{q(t.crm.in)}</td>
          <td>{q(t.crm.out)}</td>
          <td>{q(t.crm.stock)}</td>
          <td>{z(t.day.in)}</td>
          <td>{z(t.day.out)}</td>
          {t.wh ? (
            <>
              <td>{q(t.wh.in)}</td>
              <td>{q(t.wh.out)}</td>
              <td>{q(t.wh.stock)}</td>
            </>
          ) : (
            <td colSpan={3} />
          )}
        </tr>
      </tfoot>
    </table>
  );
}

type Block = ShipmentSummary["plan"] | ShipmentSummary["transit"];

function Timeline({ title, block, none, lastKey, last }: { title: string; block: Block; none: string; lastKey: "picked" | "delivered"; last: string }) {
  const lastOf = (r: Block["rows"][number] | Block["total"]) => (r as Record<string, number>)[lastKey];
  return (
    <table className="rp-t rp-sum">
      <thead>
        <tr>
          <th colSpan={6} className="h-lgrey">
            {title}
          </th>
          <th className="h-green">{last}</th>
        </tr>
        <tr className="h-cream">
          {["PoC", "Shipments", "Today or Before", "Tomorrow", "Post Tomorrow", none].map((h) => (
            <th key={h} className={h === "PoC" ? "l" : ""}>
              {h}
            </th>
          ))}
          <th className="h-green">{last}</th>
        </tr>
      </thead>
      <tbody>
        {block.rows.length ? (
          block.rows.map((r) => (
            <tr key={r.poc}>
              <td className="l">{r.poc}</td>
              <td>{z(r.n)}</td>
              <td>{z(r.before)}</td>
              <td>{z(r.tomorrow)}</td>
              <td>{z(r.post)}</td>
              <td>{z(r.none)}</td>
              <td>{z(lastOf(r))}</td>
            </tr>
          ))
        ) : (
          <tr>
            <td className="l rp-muted" colSpan={7}>
              None
            </td>
          </tr>
        )}
      </tbody>
      <tfoot>
        <tr>
          <td className="l" />
          <td>{z(block.total.n)}</td>
          <td>{z(block.total.before)}</td>
          <td>{z(block.total.tomorrow)}</td>
          <td>{z(block.total.post)}</td>
          <td>{z(block.total.none)}</td>
          <td>{z(lastOf(block.total))}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function Ages({ title, tone, b, labels }: { title: string; tone: string; b: { count: number; buckets: number[] }; labels: string[] }) {
  const cell = ["", "c-yel2", "c-org", "c-red2", ""];
  return (
    <table className="rp-t rp-sum">
      <thead>
        <tr>
          <th colSpan={6} className={tone}>
            {title}
          </th>
        </tr>
        <tr className="h-plain">
          {labels.map((l, i) => (
            <th key={l} className={i === 0 ? "l" : cell[i - 1]}>
              {l}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="l">{b.count}</td>
          {b.buckets.map((n, i) => (
            <td key={i} className={cell[i]}>
              {n}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

export function SummarySheet({ s, when }: { s: ShipmentSummary; when: string }) {
  return (
    <div className="rp-summary">
      <div className="rp-doha">
        काल करे सो आज कर, आज करे सो अब।
        <br />
        पल में परलय होएगी, बहुरि करेगा कब॥
      </div>
      <div className="rp-sumtitle">Domestic Shipments Summary {when}</div>
      <Timeline title={`Dispatch Plan :- ${s.plan.count}  |  Pickup Timelines`} block={s.plan} none="Not Assigned" lastKey="picked" last="Picked Today" />
      <div className="rp-kpi">
        <span>Pickup X2 + Intransit</span>
        <b>{s.pickupX2}</b>
      </div>
      <Timeline title={`In Transit :- ${s.transit.count}  |  Delivered Timelines`} block={s.transit} none="ETA NA" lastKey="delivered" last="Delivered Today" />
      <div className="rp-band">Delivered in Last 4 Days: {s.delivered4}</div>
      <Ages
        title={`Fresh POs - Dispatch to be planned :- ${s.fresh.count}`}
        tone="h-green"
        b={s.fresh}
        labels={["Total Fresh PO", "0 - 4 Days Old", "4 - 8 Days Old", "8 - 12 Days Old", "> 12 Days Old", "No PO Date"]}
      />
      <Ages
        title={`PO On Long - Hold :- ${s.hold.count}`}
        tone="h-red"
        b={s.hold}
        labels={["Total Long Hold POs", "0 - 7 Days Old", "7 - 14 Days Old", "14 - 21 Days Old", "> 21 Days Old", "No PO Date"]}
      />
    </div>
  );
}

export function UpcomingSheet({ rows, when, day }: { rows: MisRow[]; when: string; day: string }) {
  return (
    <table className="rp-t rp-wide">
      <thead>
        <tr>
          <th colSpan={18} className="h-cream rp-title">
            Domestic upcoming dispatch Plans {when}
          </th>
        </tr>
        <tr className="h-grey">
          <TH>Job No.</TH>
          <TH>PO Date</TH>
          <TH>Supplier</TH>
          <TH>Customer</TH>
          <TH>Product Name</TH>
          <TH>Quantity (in KGS)</TH>
          <TH>Logistics PoC</TH>
          <TH>Cx Quote approval time</TH>
          <TH>Sx Material readiness confirmation time</TH>
          <TH c="h-y">Planned ETD (Fixed)</TH>
          <TH c="h-c">Actual/ Tentative ETD</TH>
          <TH c="h-y">Planned ETA (Fixed)</TH>
          <TH>AG Demand POC</TH>
          <TH>Logistics Type</TH>
          <TH>Vehicle type</TH>
          <TH>Transporter Details</TH>
          <TH>Logistics Payment term</TH>
          <TH>Blockers and remarks (In case of delayed)</TH>
        </tr>
      </thead>
      <tbody>
        {rows.length ? (
          rows.map((e) => (
            <tr key={e.id}>
              <td>{e.jobNo}</td>
              <td className={oldPo(e.poDate, day)}>{d(e.poDate)}</td>
              <td>{e.supplier}</td>
              <td>{e.customer}</td>
              <td>{e.productName}</td>
              <td>{q(e.quantityKgs)}</td>
              <td>
                <Pill v={e.logisticsPoc} tone="o" />
              </td>
              <td className="c-cream">{d(e.cxQuoteApprovalTime)}</td>
              <td className="c-cream">{d(e.sxReadinessTime)}</td>
              <td>{d(e.plannedEtd)}</td>
              <td className={lateTone(lateBy(e.plannedEtd, e.actualEtd))}>{d(e.actualEtd)}</td>
              <td>{d(e.plannedEta)}</td>
              <td>{e.agDemandPoc}</td>
              <td>{e.logisticsType}</td>
              <td>{e.vehicleType}</td>
              <td className="c-cream">{e.transporterDetails}</td>
              <td>
                <PayPill v={e.logisticsPaymentTerm} />
              </td>
              <td className="l rp-rem">{e.blockersRemarks}</td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={18} className="rp-muted">
              No dispatches planned.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export function TransitSheet({ rows, when, day }: { rows: MisRow[]; when: string; day: string }) {
  return (
    <table className="rp-t rp-wide">
      <thead>
        <tr>
          <th colSpan={17} className="h-cream rp-title">
            Domestic: Shipments In-Transit {when}
          </th>
        </tr>
        <tr className="h-grey">
          <TH>Job No.</TH>
          <TH>PO Date</TH>
          <TH>Supplier</TH>
          <TH>Customer</TH>
          <TH>Product Name</TH>
          <TH>Quantity (in KGS)</TH>
          <TH>Transport Doc No</TH>
          <TH c="h-c">Actual/ Tentative ETD</TH>
          <TH c="h-y">Planned ETA (Fixed)</TH>
          <TH c="h-c">Actual / Tentative ETA</TH>
          <TH>Logistics PoC</TH>
          <TH>AG Demand POC</TH>
          <TH>Logistics Type</TH>
          <TH>Transporter Details</TH>
          <TH>Logistics Payment term</TH>
          <TH>Blockers and remarks (In case of delayed)</TH>
          <TH>Movement Type</TH>
        </tr>
      </thead>
      <tbody>
        {rows.length ? (
          rows.map((e) => {
            const eta = e.actualEta || e.plannedEta;
            return (
              <tr key={e.id}>
                <td>{e.jobNo}</td>
                <td>{d(e.poDate)}</td>
                <td>{e.supplier}</td>
                <td>{e.customer}</td>
                <td>{e.productName}</td>
                <td>{q(e.quantityKgs)}</td>
                <td>
                  <Files names={e.docs.transportDoc} />
                </td>
                <td>{d(e.actualEtd)}</td>
                <td>{d(e.plannedEta)}</td>
                <td className={eta && eta <= day ? "c-pink" : ""}>{d(e.actualEta)}</td>
                <td>
                  <Pill v={e.logisticsPoc} tone="o" />
                </td>
                <td>{e.agDemandPoc}</td>
                <td>{e.logisticsType}</td>
                <td>{e.transporterDetails}</td>
                <td>
                  <PayPill v={e.logisticsPaymentTerm} />
                </td>
                <td className="l rp-rem">{e.blockersRemarks}</td>
                <td>
                  <Pill v={e.movementType ? `${e.movementType} Leg` : ""} tone={/reverse/i.test(e.movementType ?? "") ? "rr" : "g"} />
                </td>
              </tr>
            );
          })
        ) : (
          <tr>
            <td colSpan={17} className="rp-muted">
              Nothing in transit.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export function PipelineSheet({ rows, when, title, hold }: { rows: PipelineRow[]; when: string; title: string; hold?: boolean }) {
  const tone = (n: number | null) => (n === null ? "" : n >= 30 ? "c-red2" : n >= 21 ? "c-pink" : n >= 12 && !hold ? "c-pinklite" : "");
  return (
    <table className="rp-t rp-wide">
      <thead>
        <tr>
          <th colSpan={12} className="h-cream rp-title">
            {title} {when}
          </th>
        </tr>
        <tr className="h-green">
          <TH>Job No.</TH>
          <TH>PO Holding days</TH>
          <TH>PO Date</TH>
          <TH>Supplier</TH>
          <TH>Customer</TH>
          <TH>AG Demand POC</TH>
          <TH>Product Name</TH>
          <TH>Quantity (in KGS)</TH>
          <TH>Cx Quote approval time</TH>
          <TH>Sx Material readiness confirmation time</TH>
          <TH>Actual/ Tentative ETD</TH>
          <TH>Blockers and remarks (In case of delayed)</TH>
        </tr>
      </thead>
      <tbody>
        {rows.length ? (
          rows.map((p) => (
            <tr key={p.key}>
              <td>{p.jobNo}</td>
              <td className={tone(p.holding)}>{p.holding ?? ""}</td>
              <td>{d(p.poDate)}</td>
              <td>{p.supplier}</td>
              <td>{p.customer}</td>
              <td>{p.demandPoc}</td>
              <td>{p.product}</td>
              <td>{q(p.qty)}</td>
              <td>{d(istDay(p.cxQuote))}</td>
              <td>{d(istDay(p.sxReady))}</td>
              <td>{/^\d{4}-/.test(p.etd) ? d(p.etd) : p.etd}</td>
              <td className="l rp-rem">{p.remarks}</td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={12} className="rp-muted">
              None.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export function DeliveredSheet({ rows, when }: { rows: MisRow[]; when: string }) {
  return (
    <table className="rp-t rp-wide">
      <thead>
        <tr>
          <th colSpan={16} className="h-cream rp-title">
            Domestic Delivered last 4 days {when}
          </th>
        </tr>
        <tr className="h-grey">
          <TH>Job No.</TH>
          <TH>PO Date</TH>
          <TH>Supplier</TH>
          <TH>Customer</TH>
          <TH>Product Name</TH>
          <TH>Quantity (in KGS)</TH>
          <TH c="h-y">Planned ETA (Fixed)</TH>
          <TH c="h-c">Actual / Tentative ETA</TH>
          <TH>AG Demand POC</TH>
          <TH>Logistics Payment term</TH>
          <TH>Logistics Type</TH>
          <TH>Transport Doc No</TH>
          <TH>POD</TH>
          <TH>Tax Invoiced Date</TH>
          <TH>Transporter Details</TH>
          <TH>Blockers and remarks (In case of delayed)</TH>
        </tr>
      </thead>
      <tbody>
        {rows.length ? (
          rows.map((e) => (
            <tr key={e.id}>
              <td>{e.jobNo}</td>
              <td>{d(e.poDate)}</td>
              <td>{e.supplier}</td>
              <td>{e.customer}</td>
              <td>{e.productName}</td>
              <td>{q(e.quantityKgs)}</td>
              <td>{d(e.plannedEta)}</td>
              <td className={lateTone(lateBy(e.plannedEta, e.actualEta))}>{d(e.actualEta)}</td>
              <td>{e.agDemandPoc}</td>
              <td>
                <PayPill v={e.logisticsPaymentTerm} />
              </td>
              <td>{e.logisticsType}</td>
              <td>
                <Files names={e.docs.transportDoc} />
              </td>
              <td className={e.docs.pod.length ? "" : "c-blue"}>
                <Files names={e.docs.pod} />
              </td>
              <td>{d(e.taxInvoicedDate)}</td>
              <td>{e.transporterDetails}</td>
              <td className="l rp-rem">{e.blockersRemarks}</td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={16} className="rp-muted">
              Nothing delivered in the last 4 days.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

/** Sheet styles (fixed light colours, so the images look the same in any theme). */
export const SHEET_CSS = `
  .rp { width: max-content; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; font-size: 12px; padding: 6px; }
  .rp-t { border-collapse: collapse; }
  .rp-t th, .rp-t td { border: 1px dotted #555; padding: 4px 8px; text-align: center; vertical-align: middle; }
  .rp-t th { font-weight: 700; }
  .rp-t .l { text-align: left; }
  .rp-title { font-size: 13px; padding: 6px 8px !important; }
  .rp-t tfoot td { font-weight: 700; background: #f3f3f3; }
  .rp-muted { color: #888; font-style: italic; }
  .rp-t .h-orange { background: #f6b26b; }
  .rp-t .h-green, .rp-t tr.h-green th { background: #d9ead3; }
  .rp-t .h-yel, .rp-t tr.h-cream th, .rp-t th.h-cream { background: #fff2cc; }
  .rp-t tr.h-grey th, .rp-t th.h-grey { background: #d9d9d9; } .rp-t .h-lgrey { background: #f3f3f3; }
  .rp-t .h-red { background: #ea9999; } .rp-t tr.h-plain th { background: #fff; }
  .rp-t tr.h-grey th.h-y { background: #ffff00; } .rp-t tr.h-grey th.h-c { background: #00ffff; }
  .rp-sub th { background: #fff; font-weight: 600; }
  .rp-inv td:not(.l) { min-width: 70px; font-variant-numeric: tabular-nums; }
  .rp-inv td.l { min-width: 260px; }
  .rp-t .c-bad { background: #ea9999; }
  .rp-t .c-yel { background: #ffff00; } .rp-t .c-yel2 { background: #fff2cc; } .rp-t .c-org { background: #f9cb9c; }
  .rp-t .c-pink, .rp-t .c-pinklite { background: #f4cccc; } .rp-t .c-red { background: #ff0000; color: #fff; } .rp-t .c-red2 { background: #e06666; }
  .rp-t .c-cream { background: #fff2cc; } .rp-t .c-blue { background: #d0dee8; }
  .rp-pill { display: inline-block; padding: 2px 10px; border-radius: 999px; background: #e8eaed; font-size: 11.5px; white-space: nowrap; }
  .rp-pill.g { background: #d4edbc; color: #11734b; } .rp-pill.r { background: #ffcfc9; color: #b10202; } .rp-pill.o { background: #ffe5a0; color: #473821; }
  .rp-pill.rr { background: #b10202; color: #fff; }
  .rp-files { display: inline-flex; flex-direction: column; gap: 2px; font-size: 10.5px; max-width: 150px; }
  .rp-files span { background: #f1f3f4; border-radius: 4px; padding: 1px 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rp-wide td { max-width: 220px; }
  .rp-rem { max-width: 260px; font-size: 11.5px; }
  .rp-summary { display: flex; flex-direction: column; gap: 14px; width: 760px; }
  .rp-doha { background: #d9d9d9; text-align: center; font-size: 17px; font-weight: 700; padding: 10px; border: 1px solid #999; line-height: 1.5; }
  .rp-sumtitle { background: #d9d9d9; text-align: center; font-size: 18px; font-weight: 700; padding: 10px; border: 1px solid #999; margin-top: -15px; }
  .rp-sum { width: 100%; }
  .rp-kpi { display: flex; align-items: stretch; }
  .rp-kpi span { padding: 6px 10px; } .rp-kpi b { background: #f4cccc; padding: 6px 30px; }
  .rp-band { background: #f3f3f3; border: 1px dotted #555; text-align: center; font-weight: 700; padding: 6px; width: 85%; }
`;
