import type { NextRequest } from "next/server";
import { todayIso } from "@/lib/ops/dates";
import { loadOutward } from "@/lib/batch-inventory/server";
import { filterOutward, outwardSheetRow } from "../../_lib/filters";
import { exportGuard, xlsxResponse } from "../../_lib/xlsx-response";

/** GET /b2b/inventory/outward/export?q=&wh=&src= — the filtered outward lines, every column. */
export async function GET(request: NextRequest) {
  const denied = await exportGuard();
  if (denied) return denied;
  const sp = request.nextUrl.searchParams;
  const rows = filterOutward(await loadOutward(), { q: sp.get("q") ?? "", wh: sp.get("wh") ?? "", src: sp.get("src") ?? "" });
  return xlsxResponse(`Outward ${todayIso()}`, [{ name: "Outward", rows: rows.map(outwardSheetRow) }]);
}
