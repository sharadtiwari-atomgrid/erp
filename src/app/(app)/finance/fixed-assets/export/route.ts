import * as XLSX from "xlsx";
import { getCurrentUser } from "@/lib/auth";
import { num } from "@/lib/format";
import { formatDmy, todayIso } from "@/lib/ops/dates";
import { can } from "@/lib/permissions";
import { assetRegister } from "../../_cash_fa/asset-data";

/** GET /finance/fixed-assets/export?q=&category=&status=&branch= → XLSX of the asset register. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  if (!can(user, "finance", "view")) return new Response("Forbidden", { status: 403 });
  const sp = new URL(request.url).searchParams;
  const rows = await assetRegister({ q: sp.get("q") ?? "", category: sp.get("category") ?? "", status: sp.get("status") ?? "", branchId: sp.get("branch") ?? "" });
  const data = rows.map((a) => ({
    Code: a.code,
    Name: a.name,
    Category: a.category,
    Branch: a.branch?.name ?? "",
    Location: a.location ?? "",
    "Acquisition date": formatDmy(a.acquisitionDate),
    Cost: a.costN,
    "Salvage value": num(a.salvageValue),
    Method: a.method,
    "Useful life (years)": a.usefulLifeYears === null ? "" : num(a.usefulLifeYears),
    "Rate %": a.ratePct === null ? "" : num(a.ratePct),
    "Accumulated depreciation": a.accumulatedN,
    "Depreciated to": a.depreciatedTo ? formatDmy(a.depreciatedTo) : "",
    "Net block": a.bookValue,
    Status: a.status,
    "Disposal date": a.disposalDate ? formatDmy(a.disposalDate) : "",
    "Disposal amount": a.disposalAmount === null ? "" : num(a.disposalAmount),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.length ? data : [{ Code: "No assets" }]), "Asset register");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Asset register ${todayIso()}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
