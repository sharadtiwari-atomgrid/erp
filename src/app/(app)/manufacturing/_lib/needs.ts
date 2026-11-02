/**
 * Manufacturing needs analyser (pure). For each open sales order line it
 * works out how much can ship from stock, how much is already covered by open
 * production orders, and recommends one next step.
 *
 * Lines are processed in required-date order so earlier lines get first claim
 * on shared stock, unlinked (make-to-stock) production and components.
 */
import { componentRequirement, round3 } from "./bom-math";

export type Recommendation = "DISPATCH" | "PRODUCE" | "PROCURE" | "IN_PRODUCTION";

export type NeedLine = {
  id: string;
  salesOrderId: string;
  warehouseId: string;
  requiredDate: Date | null;
  productId: string;
  /** Ordered − delivered. */
  outstanding: number;
  /** Stock already reserved for this line (counts as available to it). */
  reservedForLine: number;
  /** Tie-breaker for stable ordering, e.g. the SO number. */
  sortKey?: string;
};

export type NeedProduct = {
  id: string;
  supplyMode: string;
  itemType: string;
  bom: { outputQty: number; lines: Array<{ componentId: string; quantity: number; scrapPct: number }> } | null;
};

export type NeedProductionOrder = { id: string; productId: string; salesOrderLineId: string | null; remaining: number };

export type ComponentCheck = { componentId: string; required: number; available: number; short: number };

export type NeedResult = {
  lineId: string;
  recommendation: Recommendation;
  outstanding: number;
  fromStock: number;
  inProduction: number;
  /** Still uncovered after stock and open production. */
  gap: number;
  productionOrderIds: string[];
  /** For PRODUCE: component availability for the gap quantity. */
  components: ComponentCheck[];
  /** PRODUCE recommended but the product has no active BOM yet. */
  needsBom: boolean;
};

const MAKE_MODES = new Set(["MTS", "MTO", "ATO"]);
const MAKE_TYPES = new Set(["FINISHED_GOOD", "SEMI_FINISHED"]);

export function isMakeable(p: Pick<NeedProduct, "supplyMode" | "itemType">): boolean {
  if (p.supplyMode === "BUY") return false;
  return MAKE_MODES.has(p.supplyMode) || MAKE_TYPES.has(p.itemType);
}

export function analyseNeeds(input: {
  lines: NeedLine[];
  products: Map<string, NeedProduct>;
  /** Available (in hand − reserved) keyed "productId:warehouseId". */
  stock: Map<string, number>;
  openOrders: NeedProductionOrder[];
  /** Available components at the production warehouse, by product id. */
  componentStock: Map<string, number>;
}): NeedResult[] {
  const stock = new Map(input.stock);
  const components = new Map(input.componentStock);
  const pooledProduction = new Map<string, Array<{ id: string; left: number }>>();
  const linked = new Map<string, NeedProductionOrder[]>();
  for (const o of input.openOrders) {
    if (o.salesOrderLineId) linked.set(o.salesOrderLineId, [...(linked.get(o.salesOrderLineId) ?? []), o]);
    else pooledProduction.set(o.productId, [...(pooledProduction.get(o.productId) ?? []), { id: o.id, left: o.remaining }]);
  }

  const ordered = [...input.lines].sort((a, b) => {
    const ad = a.requiredDate?.getTime() ?? Number.POSITIVE_INFINITY;
    const bd = b.requiredDate?.getTime() ?? Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad < bd ? -1 : 1;
    return (a.sortKey ?? a.id).localeCompare(b.sortKey ?? b.id);
  });

  return ordered.map((line) => {
    const outstanding = round3(Math.max(0, line.outstanding));
    const key = `${line.productId}:${line.warehouseId}`;

    // 1. Stock: this line's own reservation first, then the shared pool.
    const own = Math.min(outstanding, Math.max(0, line.reservedForLine));
    const pool = Math.max(0, stock.get(key) ?? 0);
    const fromPool = Math.min(pool, outstanding - own);
    stock.set(key, round3(pool - fromPool));
    const fromStock = round3(own + fromPool);

    // 2. Open production: orders for this line, then unlinked orders for the product.
    let need = round3(outstanding - fromStock);
    let inProduction = 0;
    const productionOrderIds: string[] = [];
    for (const o of linked.get(line.id) ?? []) {
      inProduction += o.remaining;
      productionOrderIds.push(o.id);
    }
    need = round3(need - inProduction);
    for (const o of pooledProduction.get(line.productId) ?? []) {
      if (need <= 0) break;
      if (o.left <= 0) continue;
      const take = Math.min(o.left, need);
      o.left = round3(o.left - take);
      need = round3(need - take);
      inProduction += take;
      productionOrderIds.push(o.id);
    }
    inProduction = round3(inProduction);
    const gap = Math.max(0, need);

    const product = input.products.get(line.productId);
    let recommendation: Recommendation;
    const checks: ComponentCheck[] = [];
    if (fromStock >= outstanding) recommendation = "DISPATCH";
    else if (gap <= 0) recommendation = "IN_PRODUCTION";
    else if (product && isMakeable(product)) {
      recommendation = "PRODUCE";
      if (product.bom) {
        const perComponent = new Map<string, number>();
        for (const l of product.bom.lines) {
          const req = componentRequirement(l.quantity, l.scrapPct, product.bom.outputQty, gap);
          perComponent.set(l.componentId, round3((perComponent.get(l.componentId) ?? 0) + req));
        }
        for (const [componentId, required] of perComponent) {
          const available = Math.max(0, components.get(componentId) ?? 0);
          const used = Math.min(available, required);
          components.set(componentId, round3(available - used));
          checks.push({ componentId, required, available: round3(available), short: round3(required - used) });
        }
      }
    } else recommendation = "PROCURE";

    return {
      lineId: line.id,
      recommendation,
      outstanding,
      fromStock,
      inProduction,
      gap,
      productionOrderIds,
      components: checks,
      needsBom: recommendation === "PRODUCE" && !product?.bom,
    };
  });
}
