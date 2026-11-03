import { describe, expect, test } from "vitest";
import { allocate, sheetDifferences, withOutward, looseBatch, isPlaceholderBatch } from "./outward";
import { ageBand, byMaterial, compareCount, compareStock, countMatcher, planPick, stockChecks, stockLines } from "./stock-in-hand";
import { availableKg, batchesInStock, checkBatches } from "./batches";
import { B, P, inw, outw } from "./fixtures.test-helpers";

const today = "2026-10-19";

describe("allocation", () => {
  const inward = [
    inw({ id: "a", batchNo: "B-1", netWeight: 100, outwardQty: 40, inwardDate: "2026-01-01" }),
    inw({ id: "b", batchNo: "B 1", netWeight: 50, outwardQty: 0, inwardDate: "2026-02-01" }),
    inw({ id: "c", batchNo: "C1", netWeight: 30, outwardQty: 30, inwardDate: "2026-01-05" }),
  ];

  test("only dispatches entered in the ERP come off stock, oldest inward line first", () => {
    const out = [outw({ source: "sheet", batchNo: "B-1", qty: 40 }), outw({ source: "crm", batchNo: "b1", qty: 70 }), outw({ source: "crm", batchNo: "ZZ", qty: 5 })];
    const { byId, unmatched } = allocate(inward, out);
    expect(byId).toEqual({ a: 60, b: 10 });
    expect(unmatched).toHaveLength(1);
    const w = Object.fromEntries(withOutward(inward, out).map((r) => [r.id, r]));
    expect([w.a.outwardQty, w.a.sheetOutwardQty, w.a.crmOutwardQty, w.b.outwardQty, w.c.outwardQty]).toEqual([100, 40, 60, 10, 30]);
  });

  test("dispatching more than a batch holds stays on its last line", () => {
    expect(allocate(inward, [outw({ source: "crm", batchNo: "B-1", qty: 200 })]).byId).toEqual({ a: 60, b: 140 });
  });

  test("a batch number shared by two materials takes from the dispatched material only; N.A never matches", () => {
    const lines = [
      inw({ id: "x", catalogueName: "Alpha", batchNo: "B1", netWeight: 100, outwardQty: 0, inwardDate: "2026-01-01" }),
      inw({ id: "y", catalogueName: "Beta", batchNo: "B1", netWeight: 100, outwardQty: 0, inwardDate: "2026-02-01" }),
      inw({ id: "z", catalogueName: "Gamma", batchNo: "N.A", netWeight: 100, outwardQty: 0, inwardDate: "2026-02-01" }),
    ];
    const { byId, unmatched } = allocate(lines, [
      outw({ source: "crm", batchNo: "B1", catalogueName: "Beta", qty: 30 }),
      outw({ source: "crm", batchNo: "B1", catalogueName: "Delta", qty: 5 }),
      outw({ source: "crm", batchNo: "N.A", catalogueName: "Gamma", qty: 5 }),
    ]);
    expect(byId).toEqual({ y: 30 });
    expect(unmatched).toHaveLength(2);
    expect(["NA", "nil", "-", "No batch", "000", "X1"].map(isPlaceholderBatch)).toEqual([true, true, true, true, true, false]);
    expect(looseBatch("ACLMO101A003")).toBe(looseBatch("ACLM0101A003"));
    expect(looseBatch("CCO-08/301")).toBe(looseBatch("CCO-8/301"));
  });

  test("batches to reconcile: Inward sheet's Outward Qty vs the sheet's outward lines", () => {
    const d = sheetDifferences(inward, [outw({ source: "sheet", batchNo: "B-1", qty: 25 }), outw({ source: "sheet", batchNo: "C1", qty: 30 }), outw({ source: "crm", batchNo: "B-1", qty: 999 })]);
    expect(d.map((x) => [x.batchNo, x.inwardOutward, x.outwardLines, x.diff])).toEqual([["B-1", 40, 25, 15]]);
  });

  test("sheet differences: a move between our warehouses is accounted for", () => {
    const lines = [
      inw({ batchNo: "T1", productName: "Tembo", location: B, supplier: "Supplier M", netWeight: 700, outwardQty: 700 }),
      inw({ batchNo: "T1", productName: "Tembo", location: P, supplier: B, grnNo: "86", inwardDate: "2026-05-20", netWeight: 500, outwardQty: 150 }),
      inw({ batchNo: "T2", productName: "Tembo", location: B, supplier: "Supplier M", netWeight: 700, outwardQty: 700 }),
      inw({ batchNo: "T2", productName: "Tembo", location: P, supplier: B, netWeight: 350, outwardQty: 0 }),
    ];
    const outward = [outw({ source: "sheet", batchNo: "T1", qty: 200 }), outw({ source: "sheet", batchNo: "T1", qty: 150 }), outw({ source: "sheet", batchNo: "T2", qty: 150 })];
    const d = sheetDifferences(lines, outward);
    expect(d).toHaveLength(1);
    expect([d[0].batchNo, d[0].transferred, d[0].diff]).toEqual(["T2", 350, 200]);
  });
});

describe("stock in hand", () => {
  const inward = [
    inw({ id: "a", catalogueName: "Thiamethoxam Technical", productName: "Thiamethoxam Tech", batchNo: "T1", location: P, inwardDate: "2026-04-01", netWeight: 1000, units: 40, outwardQty: 400, purchaseRate: 800, expDate: "01/12/2026", type: "Technical" }),
    inw({ id: "b", catalogueName: "Thiamethoxam Technical", batchNo: "T2", location: P, inwardDate: "2026-09-01", netWeight: 500, units: 20, outwardQty: 0, expDate: "30/09/2028" }),
    inw({ id: "c", catalogueName: "Thiamethoxam Technical", batchNo: "T3", location: B, inwardDate: "2026-08-01", netWeight: 200, units: 8, outwardQty: 0, expDate: "01/10/2026" }),
    inw({ id: "d", catalogueName: "Profenofos Technical", batchNo: "P1", location: P, inwardDate: "2026-10-01", netWeight: 250, units: 1, outwardQty: 250 }),
  ];
  const outward = [outw({ source: "crm", batchNo: "T2", qty: 100 })];
  const L = stockLines(inward, outward, today);
  const by = Object.fromEntries(L.map((l) => [l.id, l]));

  test("stock per batch line: packs, value, ageing, expiry", () => {
    expect(Object.keys(by).sort()).toEqual(["a", "b", "c"]);
    expect([by.a.instockQty, by.a.packSize, by.a.packs, by.a.value, by.a.ageing, by.a.band]).toEqual([600, 25, 24, 480000, 201, "180+"]);
    expect([by.a.expIso, by.a.toExpiry, by.a.expiry]).toEqual(["2026-12-01", 43, "soon"]);
    expect([by.b.instockQty, by.b.packs, by.b.value, by.b.expiry]).toEqual([400, 16, null, "ok"]);
    expect(by.c.expiry).toBe("expired");
    expect([ageBand(0), ageBand(30), ageBand(31), ageBand(181), ageBand(null)]).toEqual(["0-30", "0-30", "31-90", "180+", "unknown"]);
  });

  test("month-year expiry runs to the month end", () => {
    const [l] = stockLines([inw({ id: "x", catalogueName: "M", batchNo: "X1", netWeight: 10, outwardQty: 0, inwardDate: "2026-10-01", expDate: "Jun-27" })], [], today);
    expect([l.expIso, l.expiry]).toEqual(["2027-06-30", "ok"]);
  });

  test("by material", () => {
    const [m] = byMaterial(L);
    expect([m.material, m.stock, m.packs, m.batches, m.value, m.valuedKg, m.avgRate, m.oldest, m.nextExpiry]).toEqual(["Thiamethoxam Technical", 1200, 48, 3, 480000, 600, 800, 201, "2026-10-01"]);
    expect(m.warehouses.sort()).toEqual([B, P]);
    expect(m.byWh).toEqual({ [P]: 1000, [B]: 200 });
    expect([m.expiredKg, m.soonKg]).toEqual([200, 600]);
  });

  test("plan a dispatch: FEFO / FIFO, warehouse, shortfall, expired left out", () => {
    const fefo = planPick(L, { material: "Thiamethoxam Technical", qty: 700, rule: "fefo" });
    expect(fefo.picks.map((p) => [p.line.batchNo, p.take, p.packs])).toEqual([["T1", 600, 24], ["T2", 100, 4]]);
    expect([fefo.available, fefo.short]).toEqual([1000, 0]);
    const fifo = planPick(L, { material: "Thiamethoxam Technical", qty: 700, rule: "fifo", includeExpired: true });
    expect(fifo.picks.map((p) => [p.line.batchNo, p.take])).toEqual([["T1", 600], ["T3", 100]]);
    const short = planPick(L, { material: "Thiamethoxam Technical", qty: 1500, warehouse: P });
    expect([short.available, short.short]).toEqual([1000, 500]);
  });

  test("checks: negative, future inward, unmatched dispatch, placeholder batch, shared batch", () => {
    const inw2 = [
      inw({ id: "n", catalogueName: "A", batchNo: "N1", netWeight: 100, outwardQty: 130, inwardDate: "2026-09-01" }),
      inw({ id: "f", catalogueName: "B", batchNo: "N.A", netWeight: 50, outwardQty: 0, inwardDate: "2026-10-26" }),
      inw({ id: "s1", catalogueName: "C", batchNo: "S-1", netWeight: 10, outwardQty: 0, inwardDate: "2026-09-01" }),
      inw({ id: "s2", catalogueName: "D", batchNo: "S1", netWeight: 10, outwardQty: 0, inwardDate: "2026-09-01" }),
    ];
    const out = [outw({ id: "u", source: "crm", batchNo: "ZZ", qty: 5 }), outw({ id: "p", source: "crm", batchNo: "NA", qty: 5 })];
    const L2 = stockLines(inw2, out, today);
    const checks = stockChecks(inw2, out, L2, today);
    const c = Object.fromEntries(checks.map((x) => [x.key, x.rows.map((r) => r.id)]));
    expect(c.negative).toEqual(["A"]);
    expect(c.unmatched).toEqual(["u", "p"]);
    expect(c.future).toEqual(["f"]);
    expect(c.nobatch).toEqual(["f"]);
    expect(c.shared.sort()).toEqual(["s1", "s2"]);
    expect(L2.find((l) => l.id === "f")!.ageing).toBeNull();
    expect(checks[0].level).toBe("bad");
  });

  test("compare with a count: by batch, placeholder batches by material", () => {
    const inw3 = [
      inw({ id: "a", catalogueName: "A", batchNo: "AB-1", netWeight: 100, outwardQty: 0, inwardDate: "2026-09-01" }),
      inw({ id: "b", catalogueName: "B", batchNo: "BB1", netWeight: 50, outwardQty: 0, inwardDate: "2026-09-01" }),
      inw({ id: "c", catalogueName: "C", batchNo: "N.A", netWeight: 20, outwardQty: 0, inwardDate: "2026-09-01" }),
      inw({ id: "d", catalogueName: "D", batchNo: "D1", netWeight: 5, outwardQty: 0, inwardDate: "2026-09-01" }),
    ];
    const r = compareCount(stockLines(inw3, [], today), [{ name: "A tech", batch: "AB1", qty: 100 }, { name: "B", batch: "BB1", qty: 40 }, { name: "C", batch: "NA", qty: 20 }, { name: "E", batch: "E1", qty: 7 }]);
    expect(Object.fromEntries(r.rows.map((x) => [x.batchNo, [x.status, x.diff]]))).toEqual({ "AB-1": ["same", 0], BB1: ["less", -10], "N.A": ["same", 0], D1: ["crmOnly", -5], E1: ["countOnly", 7] });
    expect([r.crm, r.counted, r.matched]).toEqual([175, 167, 2]);
  });

  test("compare with the warehouse's stock: per material, batch typos and other names", () => {
    const inw4 = [
      inw({ id: "a", catalogueName: "Topramezone 33.6% SC", productName: "Topramezone 33.6% SC", batchNo: "S/KRE-23", netWeight: 3000, outwardQty: 0, inwardDate: "2026-09-01" }),
      inw({ id: "b", catalogueName: "Chlorantraniliprole 9.3% + Lambda 4.6% ZC", batchNo: "ACLMO101A003", netWeight: 4421, outwardQty: 0, inwardDate: "2026-09-01" }),
      inw({ id: "c", catalogueName: "Metribuzin 70% WP", batchNo: "M1", netWeight: 1000, outwardQty: 0, inwardDate: "2026-09-01" }),
      inw({ id: "d", catalogueName: "PPT Silica", batchNo: "", netWeight: 750, outwardQty: 0, inwardDate: "2026-09-01" }),
    ];
    const r = compareStock(stockLines(inw4, [], today), [
      { name: "TOPRAMEZONE", batch: "3/KRE-23", qty: 3000 },
      { name: "CHLORANTRANILIPROLE 9.3% + LAMBDA", batch: "ACLM0101A003", qty: 4421 },
      { name: "METRIBUZIN 70%WP", batch: "M1", qty: 400 },
      { name: "PRECIPIATED SILICA", batch: "NA", qty: 750 },
      { name: "PAPER DRUM (EMPTY)", batch: "0", qty: 0 },
    ], inw4);
    const by = Object.fromEntries(r.rows.map((x) => [x.material, [x.status, x.diff]]));
    expect(by["Topramezone 33.6% SC"]).toEqual(["same", 0]);
    expect(by["Chlorantraniliprole 9.3% + Lambda 4.6% ZC"]).toEqual(["same", 0]);
    expect(by["Metribuzin 70% WP"]).toEqual(["less", -600]);
    expect(by["PPT Silica"]).toEqual(["same", 0]);
    expect(by["PRECIPIATED SILICA"]).toBeUndefined();
    expect(r.rows.find((x) => x.material === "Topramezone 33.6% SC")!.batches.every((b) => b.status === "renamed")).toBe(true);
    expect([r.crm, r.counted, r.matched]).toEqual([9171, 8571, 3]);
  });

  test("compare: the same quantity under an unknown name is marked named", () => {
    const lines = stockLines([inw({ id: "a", catalogueName: "Alpha Blend", batchNo: "AL1", netWeight: 120, outwardQty: 0, inwardDate: "2026-09-01" })], [], today);
    const r = compareStock(lines, [{ name: "Zeta Mix", batch: "ZZ9", qty: 120 }]);
    expect(r.rows.map((x) => [x.material, x.status, x.pair])).toEqual([["Alpha Blend", "named", "Zeta Mix"], ["Zeta Mix", "named", "Alpha Blend"]]);
    expect(r.matched).toBe(2);
  });

  test("a batch number on two products: the warehouse's name picks which", () => {
    const lines = [
      inw({ productName: "MANCOZEB TECHNICAL", catalogueName: "MANCOZEB TECH", batchNo: "MZE0389B2A", netWeight: 775 }),
      inw({ productName: "ATM-MANCOZEB TECHNICAL", catalogueName: "ATM-MANCOZEB TECHNICAL", batchNo: "MZE0389B2A", netWeight: 18 }),
    ];
    const match = countMatcher([], lines);
    expect(match({ name: "MANCOZEB TECH", batch: "MZE0389B2A" })).toBe("MANCOZEB TECH");
    expect(match({ name: "ATM-MANCOZEB TECHNICAL", batch: "MZE0389B2A" })).toBe("ATM-MANCOZEB TECHNICAL");
  });
});

describe("batch lookup for Domestic MIS", () => {
  test("batches: in stock, written differently, near miss, short", () => {
    const lines = [
      { batchNo: "XY20260729", material: "Trifloxystrobin Technical", productName: "Trifloxystrobin", location: P, instockQty: 825 },
      { batchNo: "ACLM0101A003", material: "Chlorantraniliprole 9.3% ZC", productName: "", location: P, instockQty: 4421 },
      { batchNo: "OLD1", material: "Gone", productName: "", location: "", instockQty: 0 },
    ];
    const b = batchesInStock(lines);
    expect(b).toHaveLength(2);
    const [ok] = checkBatches("XY20260729", "Trifloxystrobin Technical", b);
    expect([ok.found?.stock, ok.suggestion, ok.otherProduct]).toEqual([825, null, false]);
    const [oh] = checkBatches("ACLMO101A003", "Chlorantraniliprole 9.3% ZC", b);
    expect(oh.suggestion?.batchNo).toBe("ACLM0101A003");
    const [typo] = checkBatches("XY20060729", "Trifloxystrobin Technical", b);
    expect([typo.found, typo.suggestion?.batchNo]).toEqual([null, "XY20260729"]);
    const [other] = checkBatches("ACLM0101A003", "Trifloxystrobin Technical", b);
    expect(other.otherProduct).toBe(true);
    expect(availableKg(checkBatches("XY20260729, NOPE", "", b))).toBe(825);
  });
});
