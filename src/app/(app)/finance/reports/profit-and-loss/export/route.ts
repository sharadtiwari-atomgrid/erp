import type { NextRequest } from "next/server";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { loadProfitAndLoss } from "../../_lib/build";
import { describeFilters, loadFilterOptions, readFilters, urlReader } from "../../_lib/data";
import { statementAoa } from "../../_lib/sheets";
import { financeExportGuard, xlsxResponse } from "../../_lib/xlsx";

/** GET /finance/reports/profit-and-loss/export — same filters as the page. */
export async function GET(request: NextRequest) {
  const denied = await financeExportGuard();
  if (denied) return denied;
  await ensureFinanceSetup();
  const f = await readFilters(urlReader(request.nextUrl.searchParams));
  const [report, options] = await Promise.all([loadProfitAndLoss(f), loadFilterOptions()]);
  const aoa = statementAoa(["Statement of profit and loss", report.subtitle, describeFilters(f, options)], report.columns, report.pnl.lines);
  return xlsxResponse(`Profit and loss ${f.from} to ${f.to}`, [{ name: "Profit and loss", aoa }]);
}
