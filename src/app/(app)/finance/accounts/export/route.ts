import { todayIso } from "@/lib/ops/dates";
import { loadAccountTree } from "../../_gl/accounts";
import { ACCOUNT_TYPE_LABELS } from "../../_gl/ledger";
import { exportGuard, isoParam, xlsxResponse } from "../../_gl/server";

/** GET /finance/accounts/export?asOf=&type=&q=&blocked=1 → the chart of accounts with balances. */
export async function GET(request: Request) {
  const denied = await exportGuard();
  if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const asOf = isoParam(sp.get("asOf") ?? "", todayIso());
  const rows = await loadAccountTree({ asOf, type: sp.get("type") ?? "", q: sp.get("q") ?? "", showBlocked: sp.get("blocked") === "1" });
  return xlsxResponse(`Chart of accounts ${asOf}`, [
    {
      name: "Chart of accounts",
      rows: rows.map((r) => ({
        Code: r.code,
        Name: `${"    ".repeat(r.depth)}${r.name}`,
        Type: ACCOUNT_TYPE_LABELS[r.type],
        Category: r.category,
        Heading: r.isGroup ? "Yes" : "",
        "Direct posting": r.directPosting ? "Yes" : "No",
        Blocked: r.isActive ? "" : "Yes",
        Debit: r.debit,
        Credit: r.credit,
        [`Balance on ${asOf}`]: r.balance,
      })),
    },
  ]);
}
