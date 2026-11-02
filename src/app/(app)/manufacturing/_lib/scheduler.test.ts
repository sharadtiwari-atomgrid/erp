import { describe, expect, it } from "vitest";
import { autoSchedule, compareOrders, type SchedulerMachine, type SchedulerOrder } from "./scheduler";
import { bomCostRollup, componentRequirement } from "./bom-math";

// Local-time constructor so tests pass in any timezone. 2026-11-02 is a Monday.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute);

const weekdays = [1, 2, 3, 4, 5];
const machine = (id: string, extra: Partial<SchedulerMachine> = {}): SchedulerMachine => ({
  id,
  name: id,
  hoursPerDay: 8,
  shiftStart: "07:00",
  workingDays: weekdays,
  available: true,
  ...extra,
});

const order = (id: string, extra: Partial<SchedulerOrder> = {}): SchedulerOrder => ({
  id,
  number: id,
  priority: 3,
  dueDate: null,
  quantity: 1,
  operations: [{ sequence: 10, name: "Cut", machineId: "M1", setupHours: 0, runHoursPerUnit: 2 }],
  ...extra,
});

describe("autoSchedule", () => {
  it("places an operation at the start of the next working window", () => {
    const result = autoSchedule({ orders: [order("A")], machines: [machine("M1")], busy: [], from: at(2, 6) });
    expect(result.unscheduled).toEqual([]);
    expect(result.planned[0].slots).toEqual([{ machineId: "M1", operationName: "Cut", start: at(2, 7), end: at(2, 9) }]);
  });

  it("splits work across days and skips non-working days", () => {
    // Friday 13:00, window ends 15:00; 4h of work → Fri 13–15, Mon 07–09.
    const result = autoSchedule({
      orders: [order("A", { operations: [{ sequence: 10, name: "Weld", machineId: "M1", setupHours: 0, runHoursPerUnit: 4 }] })],
      machines: [machine("M1")],
      busy: [],
      from: at(6, 13),
    });
    expect(result.planned[0].slots.map((s) => [s.start, s.end])).toEqual([
      [at(6, 13), at(6, 15)],
      [at(9, 7), at(9, 9)],
    ]);
    expect(result.planned[0].end).toEqual(at(9, 9));
  });

  it("runs operations in sequence across machines", () => {
    const result = autoSchedule({
      orders: [
        order("A", {
          quantity: 2,
          operations: [
            { sequence: 20, name: "Assemble", machineId: "M2", setupHours: 0.5, runHoursPerUnit: 0.5 },
            { sequence: 10, name: "Cut", machineId: "M1", setupHours: 1, runHoursPerUnit: 1 },
          ],
        }),
      ],
      machines: [machine("M1"), machine("M2")],
      busy: [],
      from: at(2, 7),
    });
    const slots = result.planned[0].slots;
    expect(slots[0]).toMatchObject({ machineId: "M1", operationName: "Cut", start: at(2, 7), end: at(2, 10) });
    expect(slots[1]).toMatchObject({ machineId: "M2", operationName: "Assemble", start: at(2, 10), end: at(2, 11, 30) });
  });

  it("works around existing slots", () => {
    const result = autoSchedule({
      orders: [order("A", { operations: [{ sequence: 10, name: "Cut", machineId: "M1", setupHours: 0, runHoursPerUnit: 3 }] })],
      machines: [machine("M1")],
      busy: [{ machineId: "M1", start: at(2, 8), end: at(2, 10) }],
      from: at(2, 7),
    });
    expect(result.planned[0].slots.map((s) => [s.start, s.end])).toEqual([
      [at(2, 7), at(2, 8)],
      [at(2, 10), at(2, 12)],
    ]);
  });

  it("schedules higher priority first, then earlier due date", () => {
    const orders = [
      order("low", { priority: 5 }),
      order("dueLater", { priority: 1, dueDate: at(20, 0) }),
      order("dueSooner", { priority: 1, dueDate: at(10, 0) }),
    ];
    expect([...orders].sort(compareOrders).map((o) => o.id)).toEqual(["dueSooner", "dueLater", "low"]);

    const result = autoSchedule({ orders, machines: [machine("M1")], busy: [], from: at(2, 7) });
    const startOf = (id: string) => result.planned.find((p) => p.orderId === id)!.start;
    expect(startOf("dueSooner")).toEqual(at(2, 7));
    expect(startOf("dueLater")).toEqual(at(2, 9));
    expect(startOf("low")).toEqual(at(2, 11));
  });

  it("flags orders finishing after their due date", () => {
    const result = autoSchedule({
      orders: [
        order("late", { dueDate: at(2, 0), operations: [{ sequence: 10, name: "Cut", machineId: "M1", setupHours: 0, runHoursPerUnit: 10 }] }),
        order("ok", { priority: 4, dueDate: at(30, 0) }),
      ],
      machines: [machine("M1")],
      busy: [],
      from: at(2, 7),
    });
    expect(result.planned.find((p) => p.orderId === "late")!.late).toBe(true);
    expect(result.planned.find((p) => p.orderId === "ok")!.late).toBe(false);
  });

  it("respects hours per day and shift start", () => {
    const result = autoSchedule({
      orders: [order("A", { operations: [{ sequence: 10, name: "Cut", machineId: "M1", setupHours: 0, runHoursPerUnit: 20 }] })],
      machines: [machine("M1", { hoursPerDay: 16, shiftStart: "06:30" })],
      busy: [],
      from: at(2, 0),
    });
    expect(result.planned[0].slots.map((s) => [s.start, s.end])).toEqual([
      [at(2, 6, 30), at(2, 22, 30)],
      [at(3, 6, 30), at(3, 10, 30)],
    ]);
  });

  it("does not schedule on unavailable machines and releases the capacity", () => {
    const result = autoSchedule({
      orders: [
        order("broken", {
          priority: 1,
          operations: [
            { sequence: 10, name: "Cut", machineId: "M1", setupHours: 0, runHoursPerUnit: 2 },
            { sequence: 20, name: "Test", machineId: "M2", setupHours: 0, runHoursPerUnit: 1 },
          ],
        }),
        order("fine"),
      ],
      machines: [machine("M1"), machine("M2", { available: false })],
      busy: [],
      from: at(2, 7),
    });
    expect(result.unscheduled.map((u) => u.orderId)).toEqual(["broken"]);
    expect(result.planned[0]).toMatchObject({ orderId: "fine", start: at(2, 7) });
  });

  it("warns about operations without a machine and skips them", () => {
    const result = autoSchedule({
      orders: [
        order("A", {
          operations: [
            { sequence: 10, name: "Manual check", machineId: null, setupHours: 0, runHoursPerUnit: 1 },
            { sequence: 20, name: "Cut", machineId: "M1", setupHours: 0, runHoursPerUnit: 1 },
          ],
        }),
      ],
      machines: [machine("M1")],
      busy: [],
      from: at(2, 7),
    });
    expect(result.planned[0].slots).toHaveLength(1);
    expect(result.planned[0].warnings[0]).toMatch(/Manual check/);
  });

  it("gives up when a machine has no working time", () => {
    const result = autoSchedule({
      orders: [order("A")],
      machines: [machine("M1", { workingDays: [] })],
      busy: [],
      from: at(2, 7),
      horizonDays: 10,
    });
    expect(result.planned).toEqual([]);
    expect(result.unscheduled[0].reason).toMatch(/no free time/);
  });
});

describe("BOM math", () => {
  it("scales components by order quantity, output quantity and scrap", () => {
    expect(componentRequirement(2, 0, 1, 5)).toBe(10);
    expect(componentRequirement(0.5, 10, 1, 4)).toBe(2.2);
    expect(componentRequirement(3, 0, 2, 5)).toBe(7.5);
  });

  it("rolls up component and machine cost", () => {
    const rollup = bomCostRollup({
      outputQty: 2,
      lines: [{ quantity: 2, scrapPct: 10, unitCost: 100 }],
      operations: [{ setupHours: 1, runHoursPerUnit: 0.5, hourlyCost: 600 }],
    });
    expect(rollup.componentCost).toBe(220);
    expect(rollup.machineCost).toBe(1200);
    expect(rollup.total).toBe(1420);
    expect(rollup.perUnit).toBe(710);
  });
});
