import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { num } from "@/lib/format";
import { getCompany } from "@/lib/options";
import { splitGst } from "@/lib/totals";
import type { SalesVoucher } from "../_lib/tally";

const IST_OFFSET_MS = 330 * 60 * 1000;

/** "YYYY-MM-DD" → start (or end) of that IST day. */
function istDay(value: string | null, end = false): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const t = end ? Date.UTC(y, m - 1, d, 23, 59, 59, 999) : Date.UTC(y, m - 1, d);
  const date = new Date(t - IST_OFFSET_MS);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type ExportParams = { from: Date | null; to: Date | null; fromLabel: string; toLabel: string; branchId: string | null };

/** Reads ?from&to&branch. Users locked to a branch always export their own branch. */
export function readExportParams(url: URL, user: CurrentUser): ExportParams {
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  const from = istDay(fromRaw);
  const to = istDay(toRaw, true);
  return {
    from,
    to,
    fromLabel: from ? fromRaw!.replace(/-/g, "") : "start",
    toLabel: to ? toRaw!.replace(/-/g, "") : "today",
    branchId: user.branchId ?? (url.searchParams.get("branch") || null),
  };
}

function dateRange(p: ExportParams) {
  return p.from || p.to ? { ...(p.from && { gte: p.from }), ...(p.to && { lte: p.to }) } : undefined;
}

/** Issued (non-draft, non-cancelled) invoices in the range, with their GST split. */
export async function loadInvoicesForExport(p: ExportParams) {
  const where: Prisma.InvoiceWhereInput = {
    status: { notIn: ["DRAFT", "CANCELLED"] },
    ...(p.branchId && { branchId: p.branchId }),
    ...(dateRange(p) && { issueDate: dateRange(p) }),
  };
  const [invoices, company] = await Promise.all([
    db.invoice.findMany({
      where,
      orderBy: [{ issueDate: "asc" }, { number: "asc" }],
      include: {
        customer: { select: { name: true, gstin: true, state: true, billingAddress: true, city: true } },
        branch: { select: { code: true, name: true } },
        salesOrder: { select: { number: true } },
      },
    }),
    getCompany(),
  ]);
  return {
    company,
    invoices: invoices.map((inv) => {
      const placeOfSupply = inv.placeOfSupply ?? inv.customer.state;
      const gst = splitGst(num(inv.taxTotal), company.state, placeOfSupply);
      return { ...inv, placeOfSupply, gst };
    }),
  };
}

export type ExportInvoice = Awaited<ReturnType<typeof loadInvoicesForExport>>["invoices"][number];

export function toSalesVoucher(inv: ExportInvoice): SalesVoucher {
  return {
    number: inv.number,
    date: inv.issueDate,
    partyName: inv.customer.name,
    partyGstin: inv.customer.gstin,
    partyState: inv.customer.state,
    placeOfSupply: inv.placeOfSupply,
    narration: [`Invoice ${inv.number}`, inv.salesOrder ? `against ${inv.salesOrder.number}` : null, `(${inv.branch.code})`].filter(Boolean).join(" "),
    taxable: num(inv.subtotal),
    cgst: inv.gst.cgst,
    sgst: inv.gst.sgst,
    igst: inv.gst.igst,
    total: num(inv.total),
  };
}

/** Payments received in the range against non-cancelled invoices. */
export async function loadPaymentsForExport(p: ExportParams) {
  return db.payment.findMany({
    where: {
      ...(dateRange(p) && { date: dateRange(p) }),
      invoice: { status: { not: "CANCELLED" }, ...(p.branchId && { branchId: p.branchId }) },
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    include: { invoice: { select: { number: true, customer: { select: { name: true, gstin: true } }, branch: { select: { code: true } } } } },
  });
}

/** "YYYY-MM-DD" of a date in IST, for CSV cells. */
export function istDate(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function attachment(body: string, filename: string, contentType: string) {
  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
