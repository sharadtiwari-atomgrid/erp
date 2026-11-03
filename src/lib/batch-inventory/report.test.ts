import { expect, test } from "vitest";
import { foldMaterial, inventoryReport } from "./report";
import { parseWarehouseMis } from "./warehouse-mis";
import { B, P, inw, outw } from "./fixtures.test-helpers";

const day = "2026-10-28";

test("inventory report: ERP against the warehouse MIS, per material, Panoli only", () => {
  const inward = [
    inw({ id: "1", location: P, productName: "Tebuconazole Technical", batchNo: "TB1", netWeight: 11875, outwardQty: 11625, inwardDate: "2026-09-01" }),
    inw({ id: "2", location: P, productName: "Pinoxaden Technical", batchNo: "PX1", netWeight: 1275, outwardQty: 500, inwardDate: day }),
    inw({ id: "3", location: B, productName: "Elsewhere", batchNo: "E1", netWeight: 50, inwardDate: day }),
  ];
  const outward = [outw({ id: "o1", source: "sheet", warehouse: P, productName: "Pinoxaden Technical", batchNo: "PX1", qty: 500, obDate: day })];
  const wh = parseWarehouseMis({
    "Stock in Hand": [
      [" STOCK COUNT", new Date("2026-10-27T00:00:00")],
      ["TOTAL", 13150],
      ["Sr. No", "Material Description", "Batch No", "Qty Received", "Qty Dispatched", "Closing Stock"],
      [1, "TEBUCONAZOLE TECH", "TB-1", 11875, 11625, 250],
      [2, "PINOXADEN TECHNICAL", "PX1", 1275, 400, 875],
    ],
  });
  expect(wh.date).toBe("2026-10-27");
  const rep = inventoryReport({ inward, outward, whRows: wh.rows, day });
  const teb = rep.rows.find((r) => r.material === "Tebuconazole Technical")!;
  expect([teb.crm, teb.wh?.stock, teb.diff.stock]).toEqual([{ in: 11875, out: 11625, stock: 250 }, 250, false]);
  const pin = rep.rows.find((r) => r.material === "Pinoxaden Technical")!;
  expect([pin.crm.stock, pin.day, pin.wh?.stock, pin.diff.out, pin.diff.stock]).toEqual([775, { in: 1275, out: 500 }, 875, true, true]);
  expect(rep.rows.some((r) => r.material === "Elsewhere")).toBe(false);
  expect(rep.mismatches).toBe(1);
  expect(rep.totals.wh).toEqual({ in: 13150, out: 12025, stock: 1125 });
});

test("inventory report: one row per material whatever its capitals; PPT = Precipitated", () => {
  const inward = [
    inw({ id: "1", location: P, productName: "Potassium Carbonate", batchNo: "K-PC-16/5", netWeight: 14700, outwardQty: 5000, inwardDate: "2026-09-01" }),
    inw({ id: "2", location: P, productName: "Potassium carbonate", batchNo: "NA", netWeight: 1000, inwardDate: "2026-09-02" }),
    inw({ id: "3", location: P, productName: "PPT Silica", batchNo: "NA", netWeight: 1250, outwardQty: 150, inwardDate: "2026-09-03" }),
  ];
  const whRows = [
    { name: "POTASSIUM CARBONATE", batch: "K-PC-16/5", received: 13600, dispatched: 5000, closing: 8600 },
    { name: "POTASSIM CARBONATE (GRANULES)", batch: "0", received: 2100, dispatched: 0, closing: 2100 },
    { name: "PRECIPIATED SILICA", batch: "NA", received: 1250, dispatched: 150, closing: 1100 },
  ];
  const rep = inventoryReport({ inward, outward: [], whRows, day });
  const pc = rep.rows.filter((r) => /potassium/i.test(r.material));
  expect(pc).toHaveLength(1);
  expect([pc[0].material, pc[0].crm, pc[0].wh?.stock]).toEqual(["Potassium Carbonate", { in: 15700, out: 5000, stock: 10700 }, 10700]);
  const si = rep.rows.filter((r) => /silica/i.test(r.material));
  expect(si.map((r) => [r.material, r.crm.stock, r.wh?.stock])).toEqual([["PPT Silica", 1100, 1100]]);
  expect(rep.mismatches).toBe(0);
});

test("inventory report: the ATM- prefix fold applies to the listed material only", () => {
  const inward = [
    inw({ id: "1", location: P, productName: "DISPERTOX-WPM", batchNo: "32603-0076", netWeight: 300, outwardQty: 300, inwardDate: "2026-10-03" }),
    inw({ id: "2", location: P, productName: "ATM-DISPERTOX-WPM", batchNo: "32603-0076", netWeight: 20, inwardDate: "2026-09-17" }),
    inw({ id: "3", location: P, productName: "ATM-METALAXYL TECHNICAL", batchNo: "M30", netWeight: 15, inwardDate: "2026-09-17" }),
    inw({ id: "4", location: P, productName: "METALAXYL TECHNICAL", batchNo: "M77", netWeight: 1700, outwardQty: 1700, inwardDate: "2026-10-01" }),
  ];
  const rep = inventoryReport({ inward, outward: [], whRows: null, day });
  expect(rep.rows.filter((r) => /dispertox/i.test(r.material)).map((r) => [r.material, r.crm])).toEqual([["DISPERTOX-WPM", { in: 320, out: 300, stock: 20 }]]);
  expect(rep.rows.filter((r) => /metalaxyl/i.test(r.material)).map((r) => r.material)).toEqual(["ATM-METALAXYL TECHNICAL"]);
  expect(rep.totals.wh).toBeNull();
  expect(foldMaterial("Potassium  carbonate")).toBe(foldMaterial("POTASSIUM CARBONATE"));
});

test("inventory report: ERP-entered dispatches come off stock", () => {
  const inward = [inw({ id: "1", location: P, productName: "Alpha", batchNo: "A1", netWeight: 100, outwardQty: 0, inwardDate: "2026-10-01" })];
  const outward = [outw({ id: "o", source: "crm", warehouse: P, productName: "Alpha", batchNo: "A1", qty: 30, obDate: day })];
  const [row] = inventoryReport({ inward, outward, day }).rows;
  expect([row.crm, row.day]).toEqual([{ in: 100, out: 30, stock: 70 }, { in: 0, out: 30 }]);
});
