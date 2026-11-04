import { db } from "@/lib/db";
import { num } from "@/lib/format";
import { formatDmy, todayIso } from "@/lib/ops/dates";
import { exportGuard, xlsxResponse } from "../../_gl/server";
import { dimensionText } from "../../_gl/ui";
import { entryInclude, entryWhere, readEntryFilter } from "../filter";

const MAX_ROWS = 50_000;

/** GET /finance/entries/export?<same filters as the list> → G/L entries as .xlsx. */
export async function GET(request: Request) {
  const denied = await exportGuard();
  if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const filter = readEntryFilter((k) => sp.get(k) ?? "", [...sp.keys()]);
  const entries = await db.glEntry.findMany({
    where: await entryWhere(filter),
    orderBy: [{ postingDate: "asc" }, { entryNo: "asc" }],
    take: MAX_ROWS,
    include: entryInclude,
  });
  return xlsxResponse(`GL entries ${todayIso()}`, [
    {
      name: "G-L entries",
      rows: entries.map((e) => ({
        "Entry no.": e.entryNo,
        "Transaction no.": e.transactionNo,
        Date: formatDmy(e.postingDate),
        "Document type": e.documentType,
        "Document no.": e.documentNo ?? "",
        "Account code": e.account.code,
        Account: e.account.name,
        Description: e.description ?? "",
        Debit: num(e.debit),
        Credit: num(e.credit),
        Contact: e.contact?.name ?? "",
        Dimensions: dimensionText(e.dimensions),
        Reversed: e.reversed ? "Yes" : "",
      })),
    },
  ]);
}
