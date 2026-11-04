import { branchWhere } from "@/lib/branch";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { formatDmy, parseDay, todayIso } from "@/lib/ops/dates";
import { ageDocuments, dueWithin } from "../../_ar_ap/aging";
import { agingSheets } from "../../_ar_ap/aging-report";
import { exportGuard, payablesAsOf, xlsxResponse } from "../../_ar_ap/server";

/** GET /finance/aged-payables/export?asOf=YYYY-MM-DD → aged payables workbook. */
export async function GET(request: Request) {
  const denied = await exportGuard();
  if (denied) return denied;
  await ensureFinanceSetup();
  const asOf = parseDay(new URL(request.url).searchParams.get("asOf")) || todayIso();
  const { docs, advances } = await payablesAsOf(asOf, await branchWhere());
  const sheets = agingSheets(ageDocuments(docs, asOf), advances, "Supplier", "Bill");
  const dueRows = (days: number) =>
    dueWithin(docs, asOf, days).map((d) => ({
      Bill: d.number,
      "Supplier invoice": d.supplierInvoiceNo ?? "",
      Supplier: d.partyName,
      "Due date": formatDmy(d.dueDate || d.docDate),
      Balance: d.balance,
    }));
  return xlsxResponse(`Aged payables ${asOf}`, [
    { name: "Summary", rows: sheets.summary },
    { name: "Bills", rows: sheets.docs },
    { name: "Due next 7 days", rows: dueRows(7) },
    { name: "Due next 30 days", rows: dueRows(30) },
    { name: "Unapplied payments", rows: sheets.adv },
  ]);
}
