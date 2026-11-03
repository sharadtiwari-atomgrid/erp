/**
 * Every Domestic MIS field by its sheet label (CSV export, MIS pack sheets) and
 * the Monthly MIS pack: Summary, By customer, By product, Dispatched, Delivered
 * and Transporter payables for one month. Pure; ported from dashboard/MisPack.js.
 */
import { OTHERS_PAY, SETTLED, owedAmount } from "@/lib/ops/transport";
import { daysBetween } from "@/lib/ops/dates";
import { MIS_DOC_FIELDS } from "@/lib/ops/lists";
import { DOC_FIELDS, blankMisRow, dmy, isCancelled, isDelivered, statusLabel, type MisRow } from "../../views/_lib/rows";

type Cell = string | number | null;

/** [label, value] for every MIS field, in sheet order. Numbers stay numbers; dates are dd/mm/yyyy. */
export function misFields(e: MisRow): Array<[string, Cell]> {
  const transit = e.actualEta && e.actualEtd ? daysBetween(e.actualEtd, e.actualEta) : null;
  const etdMinusPo = e.poDate && e.plannedEtd ? daysBetween(e.poDate, e.plannedEtd) : null;
  const doc = (k: (typeof DOC_FIELDS)[number]) => e.docs[k].join(", ");
  return [
    ["Job No.", e.jobNo],
    ["PO Date", dmy(e.poDate)],
    ["Supplier", e.supplier],
    ["Customer", e.customer],
    ["Product Name", e.productName],
    ["Status", e.status ? statusLabel(e.status) : ""],
    ["Quantity (in KGS)", e.quantityKgs],
    ["Batch No.", e.batchNo],
    ["Gross Wt (Kg)", e.grossWtKg],
    ["Packing", e.packing],
    ["No. of Units", e.unitCount],
    ["HS Code", e.hsCode],
    ["Planned ETD (Fixed)", dmy(e.plannedEtd)],
    ["Planned ETA (Fixed)", dmy(e.plannedEta)],
    ["Cx Quote approval time", e.cxQuoteApprovalTime ? dmy(e.cxQuoteApprovalTime) : ""],
    ["Sx Material readiness confirmation time", e.sxReadinessTime ? dmy(e.sxReadinessTime) : ""],
    ["Actual / Tentative ETD", dmy(e.actualEtd)],
    ["Actual / Tentative ETA", dmy(e.actualEta)],
    ["ETD - PO Date (days)", etdMinusPo],
    ["Logistics PoC", e.logisticsPoc],
    ["AG Supply POC", e.agSupplyPoc],
    ["AG Demand POC", e.agDemandPoc],
    ["Supply POC", e.supplyPoc],
    ["Customer POC details", e.customerPocDetails],
    ["PickUp Address", e.pickupAddress],
    ["PickUp Pincode", e.pickupPincode],
    ["Drop Address", e.dropAddress],
    ["Drop Pincode", e.dropPincode],
    ["Logistics Type", e.logisticsType],
    ["Vehicle type", e.vehicleType],
    ["Transporter Details", e.transporterDetails],
    ["Total Logistics Cost", e.totalLogisticsCost],
    ["Logistics Cost (AG to Pay)", e.logisticsCostAgToPay],
    ["Logistics Payment term", e.logisticsPaymentTerm],
    ["Origin type", e.originType],
    ["Destination type", e.destinationType],
    ["Transit Time (days)", transit],
    ["Distance (Aprox) km", e.distanceApprox],
    ["Movement Type", e.movementType],
    ["Taxable value (Rs.)", e.taxableValue],
    ["Tax Invoice Month", e.taxInvoiceMonth],
    [MIS_DOC_FIELDS.taxInvoice, doc("taxInvoice")],
    ["Tax Invoiced Date", dmy(e.taxInvoicedDate)],
    [MIS_DOC_FIELDS.eWayBill, doc("eWayBill")],
    [MIS_DOC_FIELDS.coa, doc("coa")],
    [MIS_DOC_FIELDS.transportDoc, doc("transportDoc")],
    [MIS_DOC_FIELDS.pod, doc("pod")],
    ["Transport Payment Status", e.transportPaymentStatus],
    ["Transport Paid So Far (Rs.)", e.transportPaidSoFar],
    ["Transport Paid On", dmy(e.transportPaidOn)],
    ["Transport Payment Ref (UTR)", e.transportPaymentRef],
    ["Blockers and remarks (In case of delayed)", e.blockersRemarks],
  ];
}

/** Column headers, in the order misFields gives them. */
export const MIS_FIELD_LABELS = misFields(blankMisRow()).map(([label]) => label);

export const fieldRecord = (e: MisRow): Record<string, Cell> => Object.fromEntries(misFields(e));

const n0 = (v: number | null | undefined) => v ?? 0;

/** Delivered, AG-paid, not settled and still owed. */
export const owedNow = (e: MisRow) =>
  !isCancelled(e) &&
  isDelivered(e) &&
  owedAmount(e) > 0 &&
  !OTHERS_PAY.test(e.logisticsPaymentTerm ?? "") &&
  !SETTLED.test((e.transportPaymentStatus ?? "").trim());

export type PackSheet = { name: string; rows: Array<Record<string, Cell>> };

/** The Monthly MIS pack for `month` (YYYY-MM). */
export function misPack(rows: MisRow[], month: string): PackSheet[] {
  const inM = (d: string) => !!d && d.slice(0, 7) === month;
  const sent = rows.filter((e) => !isCancelled(e) && inM(e.actualEtd));
  const got = rows.filter((e) => isDelivered(e) && inM(e.actualEta));
  const timed = got.map((e) => (e.plannedEta && e.actualEta ? daysBetween(e.plannedEta, e.actualEta) : null)).filter((x): x is number => x !== null);
  const costed = sent.filter((e) => n0(e.totalLogisticsCost));
  const ckg = costed.reduce((a, e) => a + n0(e.quantityKgs), 0);
  const pay = rows.filter(owedNow);

  type ByC = { Customer: string; Shipments: number; kg: number; "Taxable value": number; Freight: number };
  const byC = new Map<string, ByC>();
  for (const e of sent) {
    const k = e.customer || "—";
    const o = byC.get(k) ?? { Customer: k, Shipments: 0, kg: 0, "Taxable value": 0, Freight: 0 };
    o.Shipments++;
    o.kg += n0(e.quantityKgs);
    o["Taxable value"] += n0(e.taxableValue);
    o.Freight += n0(e.totalLogisticsCost);
    byC.set(k, o);
  }
  type ByP = { Product: string; Shipments: number; kg: number; "Taxable value": number };
  const byP = new Map<string, ByP>();
  for (const e of sent) {
    const k = e.productName || "—";
    const o = byP.get(k) ?? { Product: k, Shipments: 0, kg: 0, "Taxable value": 0 };
    o.Shipments++;
    o.kg += n0(e.quantityKgs);
    o["Taxable value"] += n0(e.taxableValue);
    byP.set(k, o);
  }

  return [
    {
      name: "Summary",
      rows: [
        { Measure: "Shipments dispatched", Value: sent.length },
        { Measure: "kg dispatched", Value: Math.round(sent.reduce((a, e) => a + n0(e.quantityKgs), 0)) },
        { Measure: "Taxable value dispatched (₹)", Value: Math.round(sent.reduce((a, e) => a + n0(e.taxableValue), 0)) },
        { Measure: "Delivered", Value: got.length },
        { Measure: "On time % (delivered)", Value: timed.length ? Math.round((100 * timed.filter((x) => x <= 0).length) / timed.length) : "" },
        {
          Measure: "Freight per kg (₹)",
          Value: ckg ? Math.round((costed.reduce((a, e) => a + n0(e.totalLogisticsCost), 0) / ckg) * 100) / 100 : "",
        },
        { Measure: "Owed to transporters now (₹)", Value: Math.round(pay.reduce((a, e) => a + owedAmount(e), 0)) },
      ],
    },
    {
      name: "By customer",
      rows: [...byC.values()]
        .map((o) => ({ ...o, kg: Math.round(o.kg), "Freight % of value": o["Taxable value"] ? Math.round((1000 * o.Freight) / o["Taxable value"]) / 10 : "" }))
        .sort((a, b) => b["Taxable value"] - a["Taxable value"]),
    },
    { name: "By product", rows: [...byP.values()].map((o) => ({ ...o, kg: Math.round(o.kg) })).sort((a, b) => b.kg - a.kg) },
    { name: "Dispatched", rows: sent.map(fieldRecord) },
    { name: "Delivered", rows: got.map(fieldRecord) },
    {
      name: "Transporter payables",
      rows: pay.map((e) => ({
        Job: e.jobNo,
        Transporter: e.transporterDetails,
        "AG to pay (₹)": n0(e.logisticsCostAgToPay),
        "Still owed (₹)": owedAmount(e),
        Status: e.transportPaymentStatus || "Pending",
        Delivered: dmy(e.actualEta),
        Customer: e.customer,
      })),
    },
  ];
}
