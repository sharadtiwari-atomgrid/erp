import type { NextRequest } from "next/server";
import { todayIso } from "@/lib/ops/dates";
import { LOCATIONS, byMaterial, stockChecks, stockLines } from "@/lib/batch-inventory";
import { loadInward, loadOutward } from "@/lib/batch-inventory/server";
import { exportGuard, xlsxResponse } from "../../_lib/xlsx-response";
import { batchSheetRow, checkSheetRows, filterLines, materialSheetRow } from "../_lib/view";

/** GET /b2b/inventory/stock/export?q=&wh=&type=&band=&exp= — sheets "By material", "By batch" and "Checks". */
export async function GET(request: NextRequest) {
  const denied = await exportGuard();
  if (denied) return denied;
  const sp = request.nextUrl.searchParams;
  const today = todayIso();
  const [inward, outward] = await Promise.all([loadInward(), loadOutward()]);
  const all = stockLines(inward, outward, today);
  const lines = filterLines(all, { q: sp.get("q") ?? "", wh: sp.get("wh") ?? "", type: sp.get("type") ?? "", band: sp.get("band") ?? "", exp: sp.get("exp") ?? "" });
  const warehouses = [...new Set([...LOCATIONS, ...all.map((l) => l.location).filter(Boolean)])];
  const mats = byMaterial(lines).filter((m) => Math.abs(m.stock) > 0.0005);
  const checks = checkSheetRows(stockChecks(inward, outward, all, today));
  return xlsxResponse(`Stock in hand ${today}`, [
    { name: "By material", rows: mats.map((m) => materialSheetRow(m, warehouses)) },
    { name: "By batch", rows: lines.map(batchSheetRow) },
    ...(checks.length ? [{ name: "Checks", rows: checks }] : []),
  ]);
}
