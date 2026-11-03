import { describe, expect, it } from "vitest";
import { daysPastEta, journeyFromMis, journeySteps, type JourneyJob } from "./journey-data";

const base: JourneyJob = { id: "j1", jobNo: "1201", status: "PLANNED", poDate: "2026-10-01", docs: {} };
const states = (e: JourneyJob, today = "2026-10-10") => Object.fromEntries(journeySteps(e, today).map((s) => [s.key, s.state]));

describe("shipment journey", () => {
  it("a planned job: PO done, the next step is now, the rest to do", () => {
    expect(states({ ...base, plannedEtd: "2026-10-20" })).toEqual({ po: "done", quote: "now", ready: "todo", out: "todo", transit: "todo", pod: "todo", invoice: "todo" });
  });

  it("a dispatch planned in the past is late", () => {
    const s = states({ ...base, status: "MATERIAL_READY", plannedEtd: "2026-10-05" });
    expect([s.quote, s.ready, s.out]).toEqual(["done", "done", "late"]);
  });

  it("in transit past its ETA is late, with days past ETA", () => {
    const e = { ...base, status: "INTRANSIT", actualEtd: "2026-10-03", plannedEta: "2026-10-07" };
    expect(states(e).transit).toBe("late");
    expect(daysPastEta(e, "2026-10-10")).toBe(3);
    expect(daysPastEta({ ...e, status: "DELIVERED" }, "2026-10-10")).toBe(0);
  });

  it("delivered without POD: POD is now; transporter paid only when AG pays", () => {
    const e = { ...base, status: "DELIVERED", actualEtd: "2026-10-03", actualEta: "2026-10-06" };
    expect(states(e).pod).toBe("now");
    expect(states(e).paid).toBeUndefined();
    const ag = states({ ...e, logisticsCostAgToPay: 5000, docs: { pod: [{ name: "pod.pdf" }], taxInvoice: [{ name: "inv.pdf" }] } });
    expect([ag.pod, ag.invoice, ag.paid]).toEqual(["done", "done", "late"]);
    expect(states({ ...e, logisticsCostAgToPay: 5000, transportPaymentStatus: "Paid", docs: { pod: [{ name: "p" }], taxInvoice: [{ name: "i" }] } }).paid).toBe("done");
  });

  it("builds from a MisJob and its files", () => {
    const j = journeyFromMis(
      { id: "x", jobNo: "7", status: "INTRANSIT", quantityKgs: { toString: () => "250.000" }, actualEtd: new Date("2026-10-03T00:00:00Z") },
      [{ field: "eWayBill", fileName: "ewb.pdf", storageKey: "ewb/2026-10/a.pdf" }],
    );
    expect(j.quantityKgs).toBe(250);
    expect(j.actualEtd).toBe("2026-10-03");
    expect(j.docs.eWayBill).toEqual([{ name: "ewb.pdf", url: "/api/files/ewb/2026-10/a.pdf" }]);
  });
});
