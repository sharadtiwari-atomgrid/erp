import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { todayIso } from "@/lib/ops/dates";
import { toCsv } from "@/lib/ops/transport";
import { loadMisRows } from "../../views/_lib/load";
import { applyFilters, readFilters } from "../_lib/kpis";
import { MIS_FIELD_LABELS, misFields } from "../_lib/mis-pack";

/** GET /b2b/dashboard/export?<dashboard filters> — the filtered rows, every MIS field, as CSV. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  if (!can(user, "b2bReports")) return new Response("Not allowed.", { status: 403 });

  const f = readFilters(Object.fromEntries(request.nextUrl.searchParams));
  const rows = applyFilters(await loadMisRows(), f);
  const csv = toCsv(
    MIS_FIELD_LABELS,
    rows.map((e) => misFields(e).map(([, v]) => v)),
  );
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="domestic-mis-${todayIso()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

