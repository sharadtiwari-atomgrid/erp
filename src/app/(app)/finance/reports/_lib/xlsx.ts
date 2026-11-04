import "server-only";
import * as XLSX from "xlsx";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

/** Access check for finance export route handlers: a Response to return when not allowed, else null. */
export async function financeExportGuard(): Promise<Response | null> {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  if (!can(user, "finance")) return new Response("Not allowed.", { status: 403 });
  return null;
}

export type Sheet = { name: string; rows: Record<string, unknown>[] } | { name: string; aoa: unknown[][] };

/** Sheets of row objects (or arrays of arrays) → an .xlsx download. */
export function xlsxResponse(fileName: string, sheets: Sheet[]): Response {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws =
      "aoa" in s
        ? XLSX.utils.aoa_to_sheet(s.aoa.length ? s.aoa : [["No rows"]])
        : XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ "": "No rows" }]);
    XLSX.utils.book_append_sheet(wb, ws, s.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31));
  }
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName.replace(/[^\w .-]/g, "_")}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
