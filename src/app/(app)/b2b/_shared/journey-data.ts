/**
 * Data for the Shipment Journey: a plain, serialisable snapshot of one Domestic MIS
 * job (dates as YYYY-MM-DD, amounts as numbers) and its milestones. Pure: works on
 * the server, the client and in tests.
 */
import { todayIso } from "@/lib/ops/dates";

export type JourneyDoc = { name: string; url?: string | null };
export type JourneyDocKey = "taxInvoice" | "eWayBill" | "coa" | "transportDoc" | "pod";

export type JourneyJob = {
  id: string;
  jobNo: string;
  status: string | null;
  customer?: string | null;
  supplier?: string | null;
  productName?: string | null;
  quantityKgs?: number | null;
  poDate?: string | null;
  cxQuoteApprovalTime?: string | null;
  sxReadinessTime?: string | null;
  plannedEtd?: string | null;
  plannedEta?: string | null;
  actualEtd?: string | null;
  actualEta?: string | null;
  taxInvoicedDate?: string | null;
  transportPaymentStatus?: string | null;
  logisticsCostAgToPay?: number | null;
  totalLogisticsCost?: number | null;
  taxableValue?: number | null;
  logisticsPaymentTerm?: string | null;
  transporterDetails?: string | null;
  agDemandPoc?: string | null;
  agSupplyPoc?: string | null;
  logisticsPoc?: string | null;
  docs: Partial<Record<JourneyDocKey, JourneyDoc[]>>;
};

export type StepState = "done" | "now" | "todo" | "late";
export type JourneyStep = { key: string; label: string; sub: string; state: StepState };

type Decimalish = { toString(): string } | number | null | undefined;
const n = (v: Decimalish) => (v === null || v === undefined ? null : Number(v.toString()));
const day = (v: Date | string | null | undefined) => (v ? (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10) : null);
const IST_MS = 330 * 60_000;
const istDay = (v: Date | string | null | undefined) => (v ? new Date(new Date(v).getTime() + IST_MS).toISOString().slice(0, 10) : null);

/** File-like rows (e.g. OpsFile) → docs by field, with a view URL for stored files. */
export function journeyDocs(files: Array<{ field: string; fileName: string; storageKey?: string | null; url?: string | null }>) {
  const docs: JourneyJob["docs"] = {};
  for (const f of files) {
    const url = f.storageKey ? `/api/files/${f.storageKey.split("/").map(encodeURIComponent).join("/")}` : f.url ?? null;
    (docs[f.field as JourneyDocKey] ||= []).push({ name: f.fileName, url });
  }
  return docs;
}

/** A MisJob row (Prisma) plus its OpsFile rows → JourneyJob. */
export function journeyFromMis(
  job: {
    id: string;
    jobNo: string;
    status: string | null;
    customer?: string | null;
    supplier?: string | null;
    productName?: string | null;
    quantityKgs?: Decimalish;
    poDate?: Date | null;
    cxQuoteApprovalTime?: Date | null;
    sxReadinessTime?: Date | null;
    plannedEtd?: Date | null;
    plannedEta?: Date | null;
    actualEtd?: Date | null;
    actualEta?: Date | null;
    taxInvoicedDate?: Date | null;
    transportPaymentStatus?: string | null;
    logisticsCostAgToPay?: Decimalish;
    totalLogisticsCost?: Decimalish;
    taxableValue?: Decimalish;
    logisticsPaymentTerm?: string | null;
    transporterDetails?: string | null;
    agDemandPoc?: string | null;
    agSupplyPoc?: string | null;
    logisticsPoc?: string | null;
  },
  files: Array<{ field: string; fileName: string; storageKey?: string | null; url?: string | null }> = [],
): JourneyJob {
  return {
    id: job.id,
    jobNo: job.jobNo,
    status: job.status,
    customer: job.customer,
    supplier: job.supplier,
    productName: job.productName,
    quantityKgs: n(job.quantityKgs),
    poDate: day(job.poDate),
    cxQuoteApprovalTime: istDay(job.cxQuoteApprovalTime),
    sxReadinessTime: istDay(job.sxReadinessTime),
    plannedEtd: day(job.plannedEtd),
    plannedEta: day(job.plannedEta),
    actualEtd: day(job.actualEtd),
    actualEta: day(job.actualEta),
    taxInvoicedDate: day(job.taxInvoicedDate),
    transportPaymentStatus: job.transportPaymentStatus,
    logisticsCostAgToPay: n(job.logisticsCostAgToPay),
    totalLogisticsCost: n(job.totalLogisticsCost),
    taxableValue: n(job.taxableValue),
    logisticsPaymentTerm: job.logisticsPaymentTerm,
    transporterDetails: job.transporterDetails,
    agDemandPoc: job.agDemandPoc,
    agSupplyPoc: job.agSupplyPoc,
    logisticsPoc: job.logisticsPoc,
    docs: journeyDocs(files),
  };
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10-27" → "27 Oct". */
export const shortDay = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)} ${MON[Number(iso.slice(5, 7)) - 1] ?? ""}` : "");
const daysFrom = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** The ETA in use: actual / tentative, else planned. */
export const etaOf = (e: JourneyJob) => e.actualEta || e.plannedEta || null;

/** Days past the ETA for a shipment not yet delivered (0 when on time or delivered). */
export function daysPastEta(e: JourneyJob, today = todayIso()): number {
  const eta = etaOf(e);
  if (e.status === "DELIVERED" || !eta || eta >= today) return 0;
  return daysFrom(eta, today);
}

/** The milestones of a shipment, each done / now / todo / late. */
export function journeySteps(e: JourneyJob, today = todayIso()): JourneyStep[] {
  const delivered = e.status === "DELIVERED";
  const transit = e.status === "INTRANSIT";
  const out = delivered || transit || !!e.actualEtd;
  const ready = out || e.status === "MATERIAL_READY" || !!e.sxReadinessTime;
  const etd = e.actualEtd || e.plannedEtd || null;
  const eta = etaOf(e);
  const pod = (e.docs.pod?.length ?? 0) > 0;
  const invoiced = (e.docs.taxInvoice?.length ?? 0) > 0 || !!e.taxInvoicedDate;
  const payment = String(e.transportPaymentStatus ?? "").trim();
  const paid = /^paid$/i.test(payment);
  const aligned = /aligned/i.test(payment);
  const agPays = (e.logisticsCostAgToPay ?? 0) > 0;

  const steps: JourneyStep[] = [
    { key: "po", label: "PO received", sub: shortDay(e.poDate) || "—", state: "done" },
    {
      key: "quote",
      label: "Quote approved",
      sub: e.cxQuoteApprovalTime ? shortDay(e.cxQuoteApprovalTime) : ready ? "—" : "pending",
      state: e.cxQuoteApprovalTime || ready ? "done" : "todo",
    },
    {
      key: "ready",
      label: "Material ready",
      sub: e.sxReadinessTime ? shortDay(e.sxReadinessTime) : ready ? "ready" : "pending",
      state: ready ? "done" : "todo",
    },
    {
      key: "out",
      label: "Dispatched",
      sub: e.actualEtd ? shortDay(e.actualEtd) : etd ? `plan ${shortDay(etd)}` : "not planned",
      state: out ? "done" : etd && etd < today ? "late" : "todo",
    },
    {
      key: "transit",
      label: delivered ? "Delivered" : "In transit",
      sub: delivered ? shortDay(e.actualEta) || "done" : eta ? `ETA ${shortDay(eta)}` : "ETA not set",
      state: delivered ? "done" : transit || out ? (eta && eta < today ? "late" : "now") : "todo",
    },
    { key: "pod", label: "POD", sub: pod ? "received" : delivered ? "pending" : "—", state: pod ? "done" : delivered ? "now" : "todo" },
    {
      key: "invoice",
      label: "Invoiced",
      sub: e.taxInvoicedDate ? shortDay(e.taxInvoicedDate) : invoiced ? "done" : "pending",
      state: invoiced ? "done" : out ? "now" : "todo",
    },
  ];
  if (agPays)
    steps.push({
      key: "paid",
      label: "Transporter paid",
      sub: paid ? "paid" : aligned ? "aligned" : "pending",
      state: paid ? "done" : delivered ? (aligned ? "now" : "late") : "todo",
    });

  // Only the first unfinished step is "now"; a late step keeps its colour.
  let seen = false;
  return steps.map((s) => {
    if (s.state === "done") return s;
    if (!seen) {
      seen = true;
      return s.state === "todo" ? { ...s, state: "now" } : s;
    }
    return s.state === "late" ? s : { ...s, state: "todo" };
  });
}
