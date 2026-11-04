import type { NextRequest } from "next/server";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { formatDmy } from "@/lib/ops/dates";
import { cell } from "../../_lib/amount";
import { loadCashFlow } from "../../_lib/build";
import { describeFilters, loadFilterOptions, readFilters, urlReader } from "../../_lib/data";
import { financeExportGuard, xlsxResponse } from "../../_lib/xlsx";

/** GET /finance/reports/cash-flow/export — same filters as the page. */
export async function GET(request: NextRequest) {
  const denied = await financeExportGuard();
  if (denied) return denied;
  await ensureFinanceSetup();
  const f = await readFilters(urlReader(request.nextUrl.searchParams));
  const [cf, options] = await Promise.all([loadCashFlow(f), loadFilterOptions()]);
  const aoa: unknown[][] = [["Cash flow statement (indirect method)"], [`${formatDmy(f.from)} to ${formatDmy(f.to)}`, describeFilters(f, options)], [], ["Particulars", "Amount"]];
  const section = (title: string, lines: typeof cf.operating, total: number, label: string) => {
    aoa.push([title]);
    for (const l of lines) aoa.push(l.kind === "heading" ? [`  ${l.label}`] : [`  ${l.label}`, cell(l.amount)]);
    aoa.push([label, cell(total)], []);
  };
  section("A. Operating activities", cf.operating, cf.netOperating, "Net cash from operating activities (A)");
  section("B. Investing activities", cf.investing, cf.netInvesting, "Net cash from investing activities (B)");
  section("C. Financing activities", cf.financing, cf.netFinancing, "Net cash from financing activities (C)");
  aoa.push(
    ["Net increase / (decrease) in cash (A + B + C)", cf.netChange],
    ["Opening cash and cash equivalents", cf.openingCash],
    ["Closing cash and cash equivalents", cf.closingCash],
    [],
    ["Movement in cash per ledger", cf.cashMovement],
    ["Difference", cf.difference],
  );
  return xlsxResponse(`Cash flow ${f.from} to ${f.to}`, [{ name: "Cash flow", aoa }]);
}
