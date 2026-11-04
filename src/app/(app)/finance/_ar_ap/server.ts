import "server-only";
import * as XLSX from "xlsx";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { FinanceError } from "@/lib/finance/posting";
import { num } from "@/lib/format";
import { isoFromDay } from "@/lib/ops/dates";
import { can } from "@/lib/permissions";
import { balanceAsOf, istDay, type AgingDoc } from "./aging";

/** Runs a write and turns FinanceError into a form error; anything else is rethrown. */
export async function attempt<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    if (e instanceof FinanceError) return { ok: false, error: e.message };
    throw e;
  }
}

/** Access check for export route handlers: a Response to return when not allowed, else null. */
export async function exportGuard(): Promise<Response | null> {
  const user = await getCurrentUser();
  if (!user) return new Response("Sign in first.", { status: 401 });
  if (!can(user, "finance")) return new Response("Not allowed.", { status: 403 });
  return null;
}

/** Sheets of plain row objects → an .xlsx download. */
export function xlsxResponse(fileName: string, sheets: { name: string; rows: Record<string, unknown>[] }[]): Response {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ "": "No rows" }]), s.name.slice(0, 31));
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

/** Parses a JSON `applications` field: [{ docId, amount }]. */
export function readApplications(formData: FormData): Array<{ docId: string; amount: number }> | null {
  try {
    const raw = JSON.parse(String(formData.get("applications") ?? "[]"));
    if (!Array.isArray(raw)) return null;
    return raw
      .filter((r) => r && typeof r.docId === "string")
      .map((r) => ({ docId: String(r.docId), amount: Number(r.amount) || 0 }));
  } catch {
    return null;
  }
}

export type AdvanceRow = { id: string; number: string; partyId: string; partyName: string; date: string; amount: number; unapplied: number; href: string };

/** Sales invoices open on `asOf` (balance less payments dated after it added back), plus unapplied receipts. */
export async function receivablesAsOf(asOf: string, branch: { branchId?: string }) {
  const asOfDay = new Date(`${asOf}T00:00:00.000Z`);
  const invoices = await db.invoice.findMany({
    where: { ...branch, status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID"] }, issueDate: { lte: new Date(`${asOf}T23:59:59.999+05:30`) } },
    select: {
      id: true, number: true, issueDate: true, dueDate: true, total: true, customerId: true,
      customer: { select: { name: true } },
      payments: { select: { date: true, amount: true } },
    },
  });
  const docs: AgingDoc[] = invoices
    .map((i) => ({
      id: i.id,
      number: i.number,
      partyId: i.customerId,
      partyName: i.customer.name,
      docDate: istDay(i.issueDate),
      dueDate: i.dueDate ? istDay(i.dueDate) : null,
      total: num(i.total),
      balance: balanceAsOf(num(i.total), i.payments.map((p) => ({ date: istDay(p.date), amount: num(p.amount) })), asOf),
    }))
    .filter((d) => Math.abs(d.balance) > 0.004);

  const receipts = await db.cashReceipt.findMany({
    where: { status: "POSTED", unappliedAmount: { gt: 0 }, date: { lte: asOfDay } },
    orderBy: { date: "asc" },
    select: { id: true, number: true, date: true, amount: true, unappliedAmount: true, customerId: true, customer: { select: { name: true } } },
  });
  const advances: AdvanceRow[] = receipts.map((r) => ({
    id: r.id,
    number: r.number,
    partyId: r.customerId,
    partyName: r.customer.name,
    date: isoFromDay(r.date),
    amount: num(r.amount),
    unapplied: num(r.unappliedAmount),
    href: `/finance/receipts/${r.id}`,
  }));
  return { docs, advances };
}

/** Posted purchase invoices open on `asOf`, plus unapplied vendor payments (advances). */
export async function payablesAsOf(asOf: string, branch: { branchId?: string }) {
  const asOfDay = new Date(`${asOf}T00:00:00.000Z`);
  const bills = await db.purchaseInvoice.findMany({
    where: { ...branch, status: { in: ["POSTED", "PARTIALLY_PAID", "PAID"] }, invoiceDate: { lte: asOfDay } },
    select: {
      id: true, number: true, supplierInvoiceNo: true, invoiceDate: true, dueDate: true, total: true, supplierId: true,
      supplier: { select: { name: true } },
      applications: { where: { payment: { status: "POSTED" } }, select: { amount: true, payment: { select: { date: true } } } },
    },
  });
  const docs: Array<AgingDoc & { supplierInvoiceNo: string | null }> = bills
    .map((b) => ({
      id: b.id,
      number: b.number,
      supplierInvoiceNo: b.supplierInvoiceNo,
      partyId: b.supplierId,
      partyName: b.supplier.name,
      docDate: isoFromDay(b.invoiceDate),
      dueDate: b.dueDate ? isoFromDay(b.dueDate) : null,
      total: num(b.total),
      balance: balanceAsOf(num(b.total), b.applications.map((a) => ({ date: isoFromDay(a.payment.date), amount: num(a.amount) })), asOf),
    }))
    .filter((d) => Math.abs(d.balance) > 0.004);

  const payments = await db.vendorPayment.findMany({
    where: { status: "POSTED", unappliedAmount: { gt: 0 }, date: { lte: asOfDay } },
    orderBy: { date: "asc" },
    select: { id: true, number: true, date: true, amount: true, unappliedAmount: true, supplierId: true, supplier: { select: { name: true } } },
  });
  const advances: AdvanceRow[] = payments.map((p) => ({
    id: p.id,
    number: p.number,
    partyId: p.supplierId,
    partyName: p.supplier.name,
    date: isoFromDay(p.date),
    amount: num(p.amount),
    unapplied: num(p.unappliedAmount),
    href: `/finance/vendor-payments/${p.id}`,
  }));
  return { docs, advances };
}
