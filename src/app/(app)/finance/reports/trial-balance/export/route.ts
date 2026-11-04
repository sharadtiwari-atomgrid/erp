import type { NextRequest } from "next/server";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { drCr } from "@/lib/finance/reports";
import { formatDmy } from "@/lib/ops/dates";
import { cell } from "../../_lib/amount";
import { loadTrialBalance } from "../../_lib/build";
import { describeFilters, loadFilterOptions, readFilters, urlReader } from "../../_lib/data";
import { financeExportGuard, xlsxResponse } from "../../_lib/xlsx";

/** GET /finance/reports/trial-balance/export — same filters as the page. */
export async function GET(request: NextRequest) {
  const denied = await financeExportGuard();
  if (denied) return denied;
  await ensureFinanceSetup();
  const f = await readFilters(urlReader(request.nextUrl.searchParams));
  const [tb, options] = await Promise.all([loadTrialBalance(f), loadFilterOptions()]);
  const aoa: unknown[][] = [
    ["Trial balance"],
    [`${formatDmy(f.from)} to ${formatDmy(f.to)}`, describeFilters(f, options)],
    [],
    ["Code", "Account", "Opening Dr", "Opening Cr", "Debit", "Credit", "Closing Dr", "Closing Cr"],
  ];
  for (const g of tb.groups) {
    aoa.push([g.heading?.code ?? "", g.heading?.name ?? "Other accounts"]);
    for (const r of g.rows) {
      const o = drCr(r.opening);
      const c = drCr(r.closing);
      aoa.push([r.code, r.name, cell(o.dr), cell(o.cr), cell(r.debit), cell(r.credit), cell(c.dr), cell(c.cr)]);
    }
    const s = g.subtotal;
    aoa.push(["", "Subtotal", s.openingDr, s.openingCr, s.debit, s.credit, s.closingDr, s.closingCr]);
  }
  const t = tb.totals;
  aoa.push([], ["", tb.balanced ? "Total (balanced)" : "Total (OUT OF BALANCE)", t.openingDr, t.openingCr, t.debit, t.credit, t.closingDr, t.closingCr]);
  return xlsxResponse(`Trial balance ${f.from} to ${f.to}`, [{ name: "Trial balance", aoa }]);
}
