import { describe, expect, it } from "vitest";
import { blankMisRow, type FpoRow } from "../views/_lib/rows";
import { HREF, ddayBoards, greeting, needsYou } from "./needs";

// Fictional data only.
const today = "2026-11-02";
const mis = [
  blankMisRow({ id: "a", jobNo: "201", status: "INTRANSIT", customer: "Acme Agro", actualEtd: "2026-10-28", plannedEta: "2026-10-30", transporterDetails: "Sample Roadways, 98xxxx" }),
  blankMisRow({ id: "b", jobNo: "202", status: "PLANNED", customer: "Beta Chem", plannedEtd: "2026-10-29" }),
  blankMisRow({ id: "c", jobNo: "203", status: "PLANNED", customer: "Gamma Labs", plannedEtd: today }),
  blankMisRow({ id: "d", jobNo: "204", status: "INTRANSIT", customer: "Delta Seeds", actualEtd: today, plannedEtd: today, plannedEta: "2026-11-04" }),
  blankMisRow({
    id: "e",
    jobNo: "205",
    status: "DELIVERED",
    customer: "Epsilon Ltd",
    actualEta: "2026-09-20",
    logisticsCostAgToPay: 4000,
    logisticsPaymentTerm: "AG to Pay",
    transporterDetails: "Sample Roadways",
  }),
  blankMisRow({ id: "f", jobNo: "206", status: "PLANNED", customer: "Old Co", plannedEtd: "2026-08-01" }),
  blankMisRow({ id: "g", jobNo: "207", status: "DELIVERED", customer: "Zeta", actualEta: today, docs: { taxInvoice: [], eWayBill: [], coa: [], transportDoc: [], pod: ["pod.pdf"] } }),
];
const po = (p: Partial<FpoRow> & Pick<FpoRow, "id">): FpoRow => ({
  requestNo: 1,
  board: "FRESH",
  stage: "DEMAND_PENDING",
  customer: "Acme Agro",
  supplier: null,
  product: null,
  demandPoc: null,
  poDate: "",
  poQty: null,
  qtyToDispatch: null,
  notes: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  ...p,
});
const fpo = [po({ id: "p1" }), po({ id: "p2", stage: "READY" }), po({ id: "p3", board: "LONG_HOLD" })];
const txName = (raw: string | null) => (raw ?? "").split(",")[0].trim();

describe("Today", () => {
  it("lists today's dispatches and deliveries, not-done first", () => {
    const b = ddayBoards(mis, today);
    expect(b.dispatch.map((x) => [x.e.jobNo, x.done])).toEqual([
      ["203", false],
      ["204", true],
    ]);
    expect(b.arrive.map((x) => [x.e.jobNo, x.done])).toEqual([["207", true]]);
  });

  it("puts the most urgent first and only what the role can open", () => {
    const items = needsYou({ today, allow: () => true, mis, fpo, checks: null, lost: [], damage: [{ status: "Open", type: "Damage", productName: "Test Powder" }], feedback: [{ kind: "BUG", title: "Broken" }], txName });
    expect(items.map((i) => i.tag)).toEqual([
      "Not dispatched", // 4 days late
      "Past ETA", // 3 days
      "Bug",
      "POD missing", // 43 days, listed before the equally old due
      "Payment due",
      "Demand pending",
      "Long hold",
      "Damage",
      "Today",
      "Ready",
    ]);
    expect(items.find((i) => i.tag === "Payment due")?.title).toBe("Sample Roadways · ₹4,000");
    expect(items.some((i) => i.title.includes("206"))).toBe(false); // over 30 days late: not today's work

    const limited = needsYou({ today, allow: (h) => h === HREF.fresh, mis, fpo, checks: null, lost: null, damage: null, feedback: null, txName });
    expect(limited.every((i) => i.href === HREF.fresh)).toBe(true);
  });

  it("greets by IST time of day", () => {
    expect(greeting(new Date("2026-11-02T03:00:00Z"), "Asha Rao")).toBe("Good morning, Asha");
    expect(greeting(new Date("2026-11-02T08:00:00Z"), "Asha")).toBe("Good afternoon, Asha");
    expect(greeting(new Date("2026-11-02T13:00:00Z"), "")).toBe("Good evening");
  });
});
