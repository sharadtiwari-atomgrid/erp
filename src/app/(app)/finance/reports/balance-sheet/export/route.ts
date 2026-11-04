import type { NextRequest } from "next/server";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { loadBalanceSheet } from "../../_lib/build";
import { describeFilters, loadFilterOptions, readFilters, urlReader } from "../../_lib/data";
import { statementAoa } from "../../_lib/sheets";
import { financeExportGuard, xlsxResponse } from "../../_lib/xlsx";

/** GET /finance/reports/balance-sheet/export — same filters as the page. */
export async function GET(request: NextRequest) {
  const denied = await financeExportGuard();
  if (denied) return denied;
  await ensureFinanceSetup();
  const f = await readFilters(urlReader(request.nextUrl.searchParams));
  const [report, options] = await Promise.all([loadBalanceSheet(f), loadFilterOptions()]);
  const aoa = statementAoa(["Balance sheet (Schedule III)", describeFilters(f, options)], report.columns, report.bs.lines);
  aoa.push([], ["Difference (assets − equity and liabilities)", "", ...report.bs.difference]);
  return xlsxResponse(`Balance sheet ${f.asOn}`, [{ name: "Balance sheet", aoa }]);
}
