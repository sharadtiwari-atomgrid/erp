import "server-only";
import * as XLSX from "xlsx";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

/** Access check for export route handlers: a Response to return when not allowed, else null. */
export async function exportGuard(): Promise<Response | null> {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  if (!can(user, "batchInventory")) return new Response("Not allowed.", { status: 403 });
  return null;
}

/** Sheets of plain row objects → an .xlsx download. */
export function xlsxResponse(fileName: string, sheets: { name: string; rows: Record<string, unknown>[] }[]): Response {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ "": "No rows" }]), s.name.slice(0, 31));
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName.replace(/[^\w .-]/g, "_")}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
