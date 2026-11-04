import { branchWhere } from "@/lib/branch";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { parseDay, todayIso } from "@/lib/ops/dates";
import { ageDocuments } from "../../_ar_ap/aging";
import { agingSheets } from "../../_ar_ap/aging-report";
import { exportGuard, receivablesAsOf, xlsxResponse } from "../../_ar_ap/server";

/** GET /finance/aged-receivables/export?asOf=YYYY-MM-DD → aged receivables workbook. */
export async function GET(request: Request) {
  const denied = await exportGuard();
  if (denied) return denied;
  await ensureFinanceSetup();
  const asOf = parseDay(new URL(request.url).searchParams.get("asOf")) || todayIso();
  const { docs, advances } = await receivablesAsOf(asOf, await branchWhere());
  const sheets = agingSheets(ageDocuments(docs, asOf), advances, "Customer", "Invoice");
  return xlsxResponse(`Aged receivables ${asOf}`, [
    { name: "Summary", rows: sheets.summary },
    { name: "Invoices", rows: sheets.docs },
    { name: "Unapplied receipts", rows: sheets.adv },
  ]);
}
