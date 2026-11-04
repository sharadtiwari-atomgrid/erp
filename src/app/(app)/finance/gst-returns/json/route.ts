import type { NextRequest } from "next/server";
import { gstr1Json } from "@/lib/finance/gst";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { financeExportGuard } from "../../reports/_lib/xlsx";
import { loadGstReturns, resolvePeriod } from "../_lib/load";

/**
 * GET /finance/gst-returns/json?period=YYYY-MM — GSTR-1 in the GST offline
 * tool's JSON shape (best effort), for review and upload via the offline tool.
 */
export async function GET(request: NextRequest) {
  const denied = await financeExportGuard();
  if (denied) return denied;
  await ensureFinanceSetup();
  const period = resolvePeriod(request.nextUrl.searchParams.get("period"));
  const data = await loadGstReturns(period);
  const body = {
    _note: "For review / upload via the GST offline tool. Atomgrid ERP does not file returns with the GSTN.",
    ...gstr1Json(data.gstr1, data.company.gstin),
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="GSTR1_${period}_for_review.json"`,
      "Cache-Control": "no-store",
    },
  });
}
