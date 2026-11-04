import "server-only";
import * as XLSX from "xlsx";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { FinanceError } from "@/lib/finance/posting";
import { can } from "@/lib/permissions";

/** Runs a write and turns FinanceError (closed period, unbalanced…) into a message; rethrows anything else. */
export async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    if (e instanceof FinanceError) return { ok: false, error: e.message };
    throw e;
  }
}

/** Access check for finance export route handlers: a Response when not allowed, else null. */
export async function exportGuard(): Promise<Response | null> {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  if (!can(user, "finance", "view")) return new Response("Not allowed.", { status: 403 });
  return null;
}

/** Plain row objects → an .xlsx download. */
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

export type DimensionOption = { code: string; name: string; values: Array<{ code: string; name: string; isActive: boolean }> };

/** Active dimensions with all their values (inactive ones flagged, so old tags still display). */
export async function getDimensionOptions(): Promise<DimensionOption[]> {
  return db.dimension.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { code: true, name: true, values: { orderBy: { code: "asc" }, select: { code: true, name: true, isActive: true } } },
  });
}

export async function getBranchOptions() {
  return db.branch.findMany({ orderBy: { name: "asc" }, select: { id: true, code: true, name: true } });
}

/** Payment id → invoice id, for linking "Payment" ledger entries to their invoice. */
export async function paymentInvoiceMap(sourceIds: string[]): Promise<Map<string, string>> {
  if (sourceIds.length === 0) return new Map();
  const payments = await db.payment.findMany({ where: { id: { in: sourceIds } }, select: { id: true, invoiceId: true } });
  return new Map(payments.map((p) => [p.id, p.invoiceId]));
}

/** Reads a YYYY-MM-DD search param, or the fallback. */
export function isoParam(value: string, fallback: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}
