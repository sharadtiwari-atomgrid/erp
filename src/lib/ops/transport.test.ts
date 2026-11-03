import { describe, expect, it } from "vitest";
import {
  amount, bucketOf, buildPayables, buildPerformance, buildTrips, groupPayables, lastPin, makePinResolver,
  makeTransporterResolver, onTimeTone, overallRecord, owedAmount, payableAmount, phoneDigits, pinMatch, podTone,
  rankHistory, rankLeads, resolvePlace, stageOf, toCsv, zoneOf, type TransportJob,
} from "./transport";

const job = (over: Partial<TransportJob>): TransportJob => ({ id: Math.random().toString(36).slice(2), ...over });

describe("amount", () => {
  it("takes the first number in text", () => {
    expect(amount("₹ 12,500/-")).toBe(12500);
    expect(amount("6500+ 2300 (Job no 976)")).toBe(6500);
    expect(amount(null)).toBe(0);
    expect(amount(42.5)).toBe(42.5);
    expect(amount({ toString: () => "1200.50" })).toBe(1200.5);
  });
});

describe("makeTransporterResolver", () => {
  const resolve = makeTransporterResolver(["Sample Roadways", "Sample Roadways Express", { name: "Blue Cargo" }]);
  it("prefers the longest master name found in the text", () => {
    expect(resolve("SAMPLE ROADWAYS EXPRESS (GSTIN 00XXXXX)")).toBe("Sample Roadways Express");
    expect(resolve("sample roadways, 98xxxxxx")).toBe("Sample Roadways");
    expect(resolve("Blue cargo")).toBe("Blue Cargo");
  });
  it("falls back to the head of the text, title-cased", () => {
    expect(resolve("quick  movers (gst 123)")).toBe("Quick Movers");
    expect(resolve("green lines - 99999")).toBe("Green Lines");
    expect(resolve("north line | 12")).toBe("North Line");
    expect(resolve("")).toBe("");
    expect(resolve(null)).toBe("");
  });
});

describe("makePinResolver", () => {
  const pins = makePinResolver([
    { name: "Alpha Chem", pincode: "390001", roles: ["SUPPLIER"] },
    { name: "Beta Agro", pincode: "560001", roles: ["CUSTOMER"] },
    { name: "Gamma Labs", pincode: "110001", roles: ["OTHER"] },
  ]);
  it("uses the pincode field, then the address, then the master", () => {
    expect(pins({ pickupPincode: "400001", pickupAddress: "x 411001", supplier: "Alpha Chem" }).from).toBe("400001");
    expect(pins({ pickupAddress: "Plot 1, GIDC 392001 and 393002", supplier: "Alpha Chem" }).from).toBe("393002");
    expect(pins({ supplier: " alpha chem " }).from).toBe("390001");
    expect(pins({ customer: "Beta Agro" }).to).toBe("560001");
    expect(pins({ customer: "Gamma Labs" }).to).toBe("110001");
    expect(pins({ customer: "Nobody" }).to).toBe("");
  });
  it("lastPin ignores longer digit runs", () => {
    expect(lastPin("Ph 9876543210, PIN 560034")).toBe("560034");
  });
});

describe("pins and zones", () => {
  it("pinMatch tiers", () => {
    expect(pinMatch("560001", "560001")).toBe(3);
    expect(pinMatch("560001", "560099")).toBe(2);
    expect(pinMatch("560001", "561099")).toBe(1);
    expect(pinMatch("560001", "110001")).toBe(0);
    expect(pinMatch("", "110001")).toBe(0);
  });
  it("zoneOf", () => {
    expect(zoneOf("110001")).toBe("North");
    expect(zoneOf("390001")).toBe("West");
    expect(zoneOf("560001")).toBe("South");
    expect(zoneOf("700001")).toBe("East");
    expect(zoneOf("900001")).toBe("Central");
    expect(zoneOf("")).toBe("");
  });
  it("phoneDigits", () => {
    expect(phoneDigits("98765 43210")).toBe("919876543210");
    expect(phoneDigits("+91 98765 43210")).toBe("919876543210");
    expect(phoneDigits("1800 599 7800")).toBe("18005997800");
    expect(phoneDigits("123")).toBe("");
  });
});

describe("owed amount and payables", () => {
  it("subtracts paid-so-far only for partial payments", () => {
    expect(owedAmount({ logisticsCostAgToPay: 10000, transportPaymentStatus: "Partially Paid", transportPaidSoFar: 4000 })).toBe(6000);
    expect(owedAmount({ logisticsCostAgToPay: 10000, transportPaymentStatus: "Pending", transportPaidSoFar: 4000 })).toBe(10000);
    expect(owedAmount({ logisticsCostAgToPay: 1000, transportPaymentStatus: "partial", transportPaidSoFar: 4000 })).toBe(0);
  });

  it("excludes cancelled, to-pay, settled and zero-owed jobs", () => {
    expect(payableAmount(job({ status: "CANCELLED", logisticsCostAgToPay: 100 }))).toBe(0);
    expect(payableAmount(job({ logisticsPaymentTerm: "To pay door delivery basis", logisticsCostAgToPay: 100 }))).toBe(0);
    expect(payableAmount(job({ logisticsPaymentTerm: "Sx to pay", logisticsCostAgToPay: 100 }))).toBe(0);
    expect(payableAmount(job({ logisticsPaymentTerm: "AG to Pay", logisticsCostAgToPay: 100 }))).toBe(100);
    expect(payableAmount(job({ transportPaymentStatus: "Paid", logisticsCostAgToPay: 100 }))).toBe(0);
    expect(payableAmount(job({ transportPaymentStatus: "Not Applicable", logisticsCostAgToPay: 100 }))).toBe(0);
    expect(payableAmount(job({ logisticsCostAgToPay: 0 }))).toBe(0);
  });

  it("ages delivered jobs and keeps undelivered ones as upcoming", () => {
    const resolve = makeTransporterResolver(["Sample Roadways"]);
    const { dues, upcoming } = buildPayables(
      [
        job({ status: "DELIVERED", transporterDetails: "Sample Roadways", logisticsCostAgToPay: 5000, actualEta: "2026-10-01" }),
        job({ status: "DELIVERED", transporterDetails: "Sample Roadways", logisticsCostAgToPay: 3000, actualEtd: new Date("2026-08-01T00:00:00Z"), transportPaymentStatus: "Payment Aligned" }),
        job({ status: "DELIVERED", logisticsCostAgToPay: 700, actualEta: "2026-11-10" }),
        job({ status: "INTRANSIT", transporterDetails: "Sample Roadways", logisticsCostAgToPay: 2000 }),
      ],
      resolve,
      "2026-11-02",
    );
    expect(upcoming).toHaveLength(1);
    expect(dues.map((d) => [d.age, d.bucket])).toEqual([[32, "b2"], [93, "b4"], [0, "b0"]]);
    expect(dues[2].transporter).toBe("(transporter not set)");
    expect(stageOf(dues[1])).toBe("aligned");
    expect(stageOf(dues[0])).toBe("pending");
    const groups = groupPayables(dues);
    expect(groups[0]).toMatchObject({ name: "Sample Roadways", total: 8000, count: 2, oldest: 93, aligned: 3000, pending: 5000 });
    expect(groups[0].buckets).toEqual({ b0: 0, b1: 0, b2: 5000, b3: 0, b4: 3000 });
    expect(groups[0].items[0].age).toBe(93);
  });

  it("bucket edges", () => {
    expect([0, 15, 16, 30, 31, 45, 46, 60, 61].map(bucketOf)).toEqual(["b0", "b0", "b1", "b1", "b2", "b2", "b3", "b3", "b4"]);
  });
});

describe("performance", () => {
  const resolve = makeTransporterResolver(["Sample Roadways", "Blue Cargo"]);
  const jobs = [
    job({ status: "DELIVERED", transporterDetails: "Sample Roadways", actualEtd: "2026-10-01", plannedEta: "2026-10-04", actualEta: "2026-10-04", totalLogisticsCost: 1000, quantityKgs: 500, taxableValue: 50000, hasPod: true }),
    job({ status: "DELIVERED", transporterDetails: "Sample Roadways", actualEtd: "2026-10-10", plannedEta: "2026-10-12", actualEta: "2026-10-15", totalLogisticsCost: 3000, quantityKgs: 1000, taxableValue: 90000 }),
    job({ status: "DELIVERED", transporterDetails: "Blue Cargo", actualEtd: "2026-10-20", actualEta: "2026-10-18", totalLogisticsCost: 800 }),
    job({ status: "DELIVERED", actualEta: "2026-10-20" }),
    job({ status: "INTRANSIT", transporterDetails: "Blue Cargo" }),
    job({ status: "DELIVERED", transporterDetails: "Blue Cargo", actualEta: "2025-01-01" }),
    job({ status: "CANCELLED", transporterDetails: "Blue Cargo", actualEta: "2026-10-20" }),
  ];

  it("computes per-transporter measures and totals", () => {
    const { rows, total, inTransit, noTransporter } = buildPerformance(jobs, resolve, "90", "2026-11-02");
    expect(inTransit).toBe(1);
    expect(noTransporter).toBe(1);
    const sr = rows.find((r) => r.name === "Sample Roadways")!;
    expect(sr).toMatchObject({ delivered: 2, onTime: 1, late: 1, lateDays: 3, lateFreight: 3000, lateValue: 90000, freight: 4000, pod: 1, podMissing: 1, onTimePct: 50, podPct: 50, avgDelay: 3 });
    expect(sr.avgTat).toBe(4);
    expect(sr.perKg).toBeCloseTo(4000 / 1500);
    const bc = rows.find((r) => r.name === "Blue Cargo")!;
    expect(bc.delivered).toBe(1);
    expect(bc.avgTat).toBeNull(); // negative TAT ignored
    expect(bc.onTimePct).toBeNull(); // no planned ETA
    expect(total.delivered).toBe(3);
  });

  it("all time includes old deliveries", () => {
    const { total } = buildPerformance(jobs, resolve, "all", "2026-11-02");
    expect(total.delivered).toBe(4);
  });

  it("tones", () => {
    expect(onTimeTone(90)).toBe("good");
    expect(onTimeTone(75)).toBe("warn");
    expect(onTimeTone(74)).toBe("bad");
    expect(onTimeTone(null)).toBe("none");
    expect(podTone(95)).toBe("good");
    expect(podTone(80)).toBe("warn");
    expect(podTone(79)).toBe("bad");
  });
});

describe("finder", () => {
  const resolve = makeTransporterResolver(["Sample Roadways", "Blue Cargo"]);
  const pins = makePinResolver([]);
  const trip = (tx: string, from: string, to: string, over: Partial<TransportJob> = {}) =>
    job({ transporterDetails: tx, pickupPincode: from, dropPincode: to, status: "DELIVERED", ...over });
  const jobs = [
    trip("Sample Roadways", "390001", "560001", { quantityKgs: 1000, totalLogisticsCost: 5000, plannedEta: "2026-01-05", actualEta: "2026-01-05", actualEtd: "2026-01-01", vehicleType: "Part Load PTL" }),
    trip("Sample Roadways", "390001", "560001", { quantityKgs: 800, totalLogisticsCost: 4800, plannedEta: "2026-02-05", actualEta: "2026-02-07", actualEtd: "2026-02-01" }),
    trip("Blue Cargo", "390005", "560010", { quantityKgs: 900, totalLogisticsCost: 3600, actualEtd: "2026-03-01" }),
    trip("Blue Cargo", "110001", "700001", { quantityKgs: 5000, vehicleType: "FTL" }),
    trip("", "390001", "560001"),
    trip("Blue Cargo", "390001", "560001", { status: "CANCELLED" }),
  ];
  const trips = buildTrips(jobs, resolve, pins);
  const overall = overallRecord(trips);

  it("builds trips without cancelled or untransported rows", () => {
    expect(trips).toHaveLength(4);
    expect(trips[0]).toMatchObject({ tx: "Sample Roadways", from: "390001", to: "560001", perKg: 5, transit: 4, delay: 0, load: "PTL" });
    expect(trips[3].load).toBe("FTL");
    expect(overall["Sample Roadways"]).toMatchObject({ trips: 2, timed: 2, onTime: 1, onTimePct: 50, last: "2026-02-01" });
  });

  it("ranks exact route above nearby and scores", () => {
    const ranked = rankHistory({ trips, A: "390001", B: "560001", qty: 900, load: "", overall });
    expect(ranked.map((c) => [c.name, c.tier])).toEqual([["Sample Roadways", 3], ["Blue Cargo", 2]]);
    const sr = ranked[0];
    expect(sr.qtyFit).toBe(true);
    expect(sr.avgPerKg).toBeCloseTo(9800 / 1800);
    expect(sr.onTimeBasis).toBe("overall");
    // 40 + 20 + min(15, 4+5) + 15*0.5 + 10 (best in tier) = 86.5 → 87
    expect(sr.score).toBe(87);
    const bc = ranked[1];
    // 28 + 20 + 6.5 + 8 + 10 = 72.5 → 73
    expect(bc.score).toBe(73);
  });

  it("filters by load", () => {
    expect(rankHistory({ trips, A: "390001", B: "", qty: 0, load: "FTL", overall })).toEqual([]);
  });

  it("ranks public leads by zone, cargo and weight", () => {
    const leads = rankLeads({ A: "390001", B: "400001", qty: 100, cargo: "Chemical", historyNames: ["Vidhi Transport Co"] });
    const vidhi = leads.find((l) => l.name === "Vidhi Transport")!;
    expect(vidhi).toMatchObject({ region: 30, cargoPublished: true, inHistory: true, score: 97 });
    const dns = leads.find((l) => l.name === "DNS Logistics")!;
    expect(dns.score).toBe(45 + 30 + 4 + 12);
    expect(leads.find((l) => l.name === "Malwa Golden Logistics")).toBeUndefined();
    expect(rankLeads({ A: "", B: "", qty: 0, cargo: "General", historyNames: [] })).toEqual([]);
  });

  it("resolves places", () => {
    const places = [{ name: "Alpha Chem", pincode: "390001", address: "GIDC Vapi" }];
    expect(resolvePlace("deliver to 560001", places, trips)).toEqual({ pin: "560001", note: "" });
    expect(resolvePlace("alpha chem", places, trips)).toEqual({ pin: "390001", note: "Alpha Chem" });
    expect(resolvePlace("vapi", places, trips)).toEqual({ pin: "390001", note: "Alpha Chem" });
    expect(resolvePlace("nowhere", places, trips)).toEqual({ pin: "", note: "not found" });
  });
});

describe("toCsv", () => {
  it("quotes and adds a BOM", () => {
    expect(toCsv(["A", "B"], [['x"y', 1]])).toBe('﻿"A","B"\n"x""y","1"');
  });
});
