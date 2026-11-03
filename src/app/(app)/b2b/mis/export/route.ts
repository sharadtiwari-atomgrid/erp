import * as XLSX from "xlsx";
import { getCurrentUser } from "@/lib/auth";
import { formatDmy, todayIso } from "@/lib/ops/dates";
import { can } from "@/lib/permissions";
import { ALL_FIELDS, computed, statusLabel, type MisValues } from "../_lib/fields";
import { filterJobs, loadLiveJobs, loadMasters } from "../_server/data";

/** GET /b2b/mis/export?q=&attn=1 → XLSX of the rows the list shows, every field by label. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in required", { status: 401 });
  if (!can(user, "b2bOrders", "view")) return new Response("Forbidden", { status: 403 });

  const sp = new URL(request.url).searchParams;
  const [{ masters }, jobs] = await Promise.all([loadMasters(), loadLiveJobs()]);
  const rows = filterJobs(jobs, masters, sp.get("q") ?? "", sp.get("attn") === "1");

  const data = rows.map((j) => {
    const v: MisValues = { ...j.values, ...computed(j.values), jobNo: j.jobNo };
    const out: Record<string, string | number> = {};
    for (const f of ALL_FIELDS) {
      if (f.type === "file") out[f.label] = (j.files[f.key as keyof typeof j.files] ?? []).join(", ");
      else if (f.type === "date") out[f.label] = v[f.key] ? formatDmy(v[f.key]) : "";
      else if (f.type === "datetime") out[f.label] = v[f.key] ? `${formatDmy(v[f.key].slice(0, 10))} ${v[f.key].slice(11, 16)}` : "";
      else if (f.key === "status") out[f.label] = statusLabel(v.status);
      else if ((f.type === "number" || f.type === "computed") && v[f.key] !== "" && Number.isFinite(Number(v[f.key]))) out[f.label] = Number(v[f.key]);
      else out[f.label] = v[f.key] ?? "";
    }
    out["Source"] = j.source;
    if (j.requestNo) out["Fresh PO Request No."] = j.requestNo;
    return out;
  });

  const ws = XLSX.utils.json_to_sheet(data, { header: [...ALL_FIELDS.map((f) => f.label), "Source"] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Domestic MIS");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Domestic MIS ${todayIso()}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
