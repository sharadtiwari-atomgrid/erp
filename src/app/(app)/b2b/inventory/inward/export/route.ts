import type { NextRequest } from "next/server";
import { todayIso } from "@/lib/ops/dates";
import { loadInward, loadOutward } from "@/lib/batch-inventory/server";
import { filterInward, inwardRows, inwardSheetRow } from "../../_lib/filters";
import { exportGuard, xlsxResponse } from "../../_lib/xlsx-response";

/** GET /b2b/inventory/inward/export?q=&loc=&stock=1 — the filtered inward lines, every column. */
export async function GET(request: NextRequest) {
  const denied = await exportGuard();
  if (denied) return denied;
  const sp = request.nextUrl.searchParams;
  const today = todayIso();
  const [inward, outward] = await Promise.all([loadInward(), loadOutward()]);
  const rows = filterInward(inwardRows(inward, outward, today), { q: sp.get("q") ?? "", loc: sp.get("loc") ?? "", stock: sp.get("stock") === "1" });
  return xlsxResponse(`Inward ${today}`, [{ name: "Inward", rows: rows.map(inwardSheetRow) }]);
}
