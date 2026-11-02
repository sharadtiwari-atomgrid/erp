/**
 * Pure BOM arithmetic shared by pages, actions and the needs analyser.
 * No database access here so it can run anywhere (and be unit tested).
 */

export const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Component quantity needed to make `orderQty` units, where the BOM line
 * gives `lineQty` per `outputQty` units and `scrapPct` extra for losses.
 */
export function componentRequirement(lineQty: number, scrapPct: number, outputQty: number, orderQty: number): number {
  if (outputQty <= 0 || orderQty <= 0) return 0;
  return round3(((lineQty * orderQty) / outputQty) * (1 + scrapPct / 100));
}

/** Planned machine hours for one operation and quantity. */
export function operationHours(setupHours: number, runHoursPerUnit: number, qty: number): number {
  return round2(setupHours + runHoursPerUnit * Math.max(0, qty));
}

export type CostLineInput = { quantity: number; scrapPct: number; unitCost: number };
export type CostOperationInput = { setupHours: number; runHoursPerUnit: number; hourlyCost: number };

export type CostRollup = {
  /** Cost of one BOM run (producing `outputQty`). */
  componentCost: number;
  machineCost: number;
  total: number;
  /** total ÷ outputQty. Setup hours are spread over the BOM's output quantity. */
  perUnit: number;
  lines: Array<{ qtyWithScrap: number; cost: number }>;
  operations: Array<{ hours: number; cost: number }>;
};

/** Component cost at purchase price plus machine time at hourly cost, for one BOM run. */
export function bomCostRollup(input: { outputQty: number; lines: CostLineInput[]; operations: CostOperationInput[] }): CostRollup {
  const outputQty = input.outputQty > 0 ? input.outputQty : 1;
  const lines = input.lines.map((l) => {
    const qtyWithScrap = round3(l.quantity * (1 + l.scrapPct / 100));
    return { qtyWithScrap, cost: round2(qtyWithScrap * l.unitCost) };
  });
  const operations = input.operations.map((o) => {
    const hours = operationHours(o.setupHours, o.runHoursPerUnit, outputQty);
    return { hours, cost: round2(hours * o.hourlyCost) };
  });
  const componentCost = round2(lines.reduce((s, l) => s + l.cost, 0));
  const machineCost = round2(operations.reduce((s, o) => s + o.cost, 0));
  const total = round2(componentCost + machineCost);
  return { componentCost, machineCost, total, perUnit: round2(total / outputQty), lines, operations };
}
