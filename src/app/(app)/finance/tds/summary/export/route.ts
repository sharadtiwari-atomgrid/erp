import type { NextRequest } from "next/server";
import { tdsQuarterOf } from "@/lib/finance/chart";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { todayIso } from "@/lib/ops/dates";
import { financeExportGuard, xlsxResponse } from "../../../reports/_lib/xlsx";
import { loadQuarterSummary } from "../../_lib/summary";
import { kindOf, returnForm } from "../../_lib/tds";

/** GET /finance/tds/summary/export?kind=TDS|TCS&quarter=… — the quarterly summary per section and deductee. */
export async function GET(request: NextRequest) {
  const denied = await financeExportGuard();
  if (denied) return denied;
  await ensureFinanceSetup();
  const sp = request.nextUrl.searchParams;
  const kind = kindOf(sp.get("kind"));
  const quarter = sp.get("quarter") || tdsQuarterOf(todayIso());
  const summary = await loadQuarterSummary(kind, quarter);
  const rows = summary.sections.flatMap((s) =>
    s.rows.map((r) => ({
      Section: s.code,
      "Section description": s.description,
      [kind === "TCS" ? "Collectee" : "Deductee"]: r.name,
      PAN: r.pan ?? "",
      GSTIN: r.gstin ?? "",
      Entries: r.entries,
      "Amount paid / credited": r.base,
      [kind]: r.tax,
      Deposited: r.deposited,
      Challans: r.challans.join(", "),
    })),
  );
  const bySection = summary.sections.map((s) => ({ Section: s.code, Description: s.description, Entries: s.total.entries, "Amount paid": s.total.base, [kind]: s.total.tax, Deposited: s.total.deposited }));
  return xlsxResponse(`${returnForm(kind)} ${quarter}`, [
    { name: "Deductee-wise", rows },
    { name: "Section-wise", rows: bySection },
  ]);
}
