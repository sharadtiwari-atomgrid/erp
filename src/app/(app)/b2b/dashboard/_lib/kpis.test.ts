import { describe, expect, it } from "vitest";
import { blankMisRow, type MisRow } from "../../views/_lib/rows";
import { applyFilters, dashboardMetrics, payBucketOf, readFilters } from "./kpis";
import { MIS_FIELD_LABELS, misFields, misPack, owedNow } from "./mis-pack";

// Fictional data only.
const doc = (pod = false, inv = false): MisRow["docs"] => ({ taxInvoice: inv ? ["inv.pdf"] : [], eWayBill: [], coa: [], transportDoc: [], pod: pod ? ["pod.jpg"] : [] });
const rows: MisRow[] = [
  blankMisRow({ id: "1", jobNo: "101", status: "DELIVERED", customer: "Acme Agro", productName: "Test Powder", quantityKgs: 1000, taxableValue: 50000, totalLogisticsCost: 5000, logisticsCostAgToPay: 5000, logisticsPaymentTerm: "AG to Pay", plannedEtd: "2026-10-02", actualEtd: "2026-10-03", plannedEta: "2026-10-06", actualEta: "2026-10-05", transportPaymentStatus: "Pending", docs: doc(true, true) }),
  blankMisRow({ id: "2", jobNo: "102", status: "DELIVERED", customer: "Acme Agro", productName: "Test Liquid", quantityKgs: 500, taxableValue: 30000, totalLogisticsCost: 3000, logisticsCostAgToPay: 3000, logisticsPaymentTerm: "AG to Pay", plannedEtd: "2026-10-10", actualEtd: "2026-10-10", plannedEta: "2026-10-12", actualEta: "2026-10-15", transportPaymentStatus: "Partially Paid", transportPaidSoFar: 1000, docs: doc() }),
  blankMisRow({ id: "3", jobNo: "103", status: "INTRANSIT", customer: "Beta Chem", productName: "Test Powder", quantityKgs: 250, taxableValue: 20000, logisticsPaymentTerm: "Customer to Pay", plannedEtd: "2026-10-20", actualEtd: "2026-10-21", transportPaymentStatus: "Not Applicable", docs: doc() }),
  blankMisRow({ id: "4", jobNo: "104", status: "CANCELLED", customer: "Beta Chem", plannedEtd: "2026-09-28", actualEtd: "2026-10-01", transportPaymentStatus: "Paid", docs: doc() }),
  blankMisRow({ id: "5", jobNo: "105", status: "PLANNED", customer: "Gamma Labs", plannedEtd: "2026-11-02", transportPaymentStatus: "Payment Aligned", docs: doc() }),
];

describe("dashboard", () => {
  it("filters by month, customer and quick search", () => {
    expect(applyFilters(rows, readFilters({ month: "2026-10" })).map((r) => r.jobNo)).toEqual(["101", "102", "103"]);
    expect(applyFilters(rows, readFilters({ customer: "Beta Chem", q: "powder" })).map((r) => r.jobNo)).toEqual(["103"]);
  });

  it("works out the KPIs and payment buckets", () => {
    const m = dashboardMetrics(rows);
    expect(m.total).toBe(5);
    expect([m.deliveredN, m.transitN]).toEqual([2, 1]);
    expect(m.onTimePct).toBe(50); // 101 early, 102 three days late
    expect(m.avgDelay).toBe(3);
    expect(m.podPct).toBe(20);
    expect(m.pay).toEqual({ paid: 1, partial: 1, pending: 2, na: 1, unknown: 0 });
    expect(m.paidPct).toBe(25);
    expect(m.docs.find((d) => d.label === "Tax Invoice")?.n).toBe(1);
    expect(payBucketOf("")).toBe("unknown");
  });
});

describe("monthly MIS pack", () => {
  it("builds the six sheets for a month", () => {
    const pack = misPack(rows, "2026-10");
    expect(pack.map((s) => s.name)).toEqual(["Summary", "By customer", "By product", "Dispatched", "Delivered", "Transporter payables"]);
    const summary = Object.fromEntries(pack[0].rows.map((r) => [r.Measure, r.Value]));
    expect(summary["Shipments dispatched"]).toBe(3); // cancelled 104 left out
    expect(summary["kg dispatched"]).toBe(1750);
    expect(summary["Delivered"]).toBe(2);
    expect(summary["On time % (delivered)"]).toBe(50);
    expect(summary["Freight per kg (₹)"]).toBe(5.33); // 8000 / 1500
    expect(summary["Owed to transporters now (₹)"]).toBe(7000); // 5000 + (3000 − 1000)
    expect(pack[1].rows[0]).toMatchObject({ Customer: "Acme Agro", Shipments: 2, kg: 1500, Freight: 8000, "Freight % of value": 10 });
    expect(pack[2].rows.map((r) => r.Product)).toEqual(["Test Powder", "Test Liquid"]);
    expect(pack[5].rows.map((r) => [r.Job, r["Still owed (₹)"]])).toEqual([
      ["101", 5000],
      ["102", 2000],
    ]);
    expect(Object.keys(pack[3].rows[0])).toEqual(MIS_FIELD_LABELS);
  });

  it("owes only delivered, AG-paid, unsettled jobs", () => {
    expect(rows.filter(owedNow).map((r) => r.jobNo)).toEqual(["101", "102"]);
    expect(misFields(rows[0]).find(([l]) => l === "POD")?.[1]).toBe("pod.jpg");
  });
});
