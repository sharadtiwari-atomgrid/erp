import type { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { todayIso } from "@/lib/ops/dates";
import { loadMisRows } from "../../views/_lib/load";
import { misPack } from "../_lib/mis-pack";

/** GET /b2b/dashboard/mis-pack?month=YYYY-MM — the Monthly MIS pack workbook. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  if (!can(user, "b2bReports")) return new Response("Not allowed.", { status: 403 });

  const asked = request.nextUrl.searchParams.get("month") ?? "";
  const month = /^\d{4}-\d{2}$/.test(asked) ? asked : todayIso().slice(0, 7);
  const sheets = misPack(await loadMisRows(), month);

  const wb = XLSX.utils.book_new();
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.rows), s.name);
  const body = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="MIS pack ${month}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
