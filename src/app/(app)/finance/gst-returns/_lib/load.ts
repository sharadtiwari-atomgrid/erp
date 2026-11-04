import "server-only";
import { db } from "@/lib/db";
import { num } from "@/lib/format";
import { buildGstr1, buildGstr3b, isPeriod, periodRange, type GstPurchaseInvoice, type GstSalesInvoice } from "@/lib/finance/gst";
import { dayFromIso, isoFromDay, todayIso } from "@/lib/ops/dates";

/** The month to show: ?period=YYYY-MM, else the previous month (the one usually being filed). */
export function resolvePeriod(value: string | null | undefined): string {
  if (value && isPeriod(value)) return value;
  const [y, m] = todayIso().split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/** Sales and purchase documents of a month, shaped for the pure GST builders. */
export async function loadGstReturns(period: string) {
  const { from, to } = periodRange(period);
  const start = dayFromIso(from);
  const end = new Date(dayFromIso(to).getTime() + 86_400_000);
  const [company, invoices, bills, filings] = await Promise.all([
    db.companySettings.findUnique({ where: { id: 1 }, select: { state: true, gstin: true, name: true, legalName: true } }),
    db.invoice.findMany({
      where: { issueDate: { gte: start, lt: end }, status: { not: "DRAFT" } },
      orderBy: [{ issueDate: "asc" }, { number: "asc" }],
      select: {
        id: true,
        number: true,
        issueDate: true,
        status: true,
        placeOfSupply: true,
        total: true,
        customer: { select: { name: true, gstin: true, state: true } },
        lines: {
          orderBy: { position: "asc" },
          select: { description: true, quantity: true, lineTotal: true, taxRate: true, taxAmount: true, product: { select: { name: true, hsnCode: true, unit: true } } },
        },
      },
    }),
    db.purchaseInvoice.findMany({
      where: { invoiceDate: { gte: start, lte: dayFromIso(to) }, status: { in: ["POSTED", "PARTIALLY_PAID", "PAID"] } },
      orderBy: [{ invoiceDate: "asc" }, { number: "asc" }],
      select: {
        id: true,
        number: true,
        supplierInvoiceNo: true,
        invoiceDate: true,
        status: true,
        placeOfSupply: true,
        itcEligible: true,
        subtotal: true,
        taxTotal: true,
        total: true,
        supplier: { select: { name: true, gstin: true, state: true } },
      },
    }),
    db.gstReturn.findMany({ where: { period } }),
  ]);

  const sales: GstSalesInvoice[] = invoices.map((i) => ({
    id: i.id,
    number: i.number,
    date: isoFromDay(i.issueDate),
    status: i.status,
    customerName: i.customer.name,
    customerGstin: i.customer.gstin,
    customerState: i.customer.state,
    placeOfSupply: i.placeOfSupply,
    total: num(i.total),
    lines: i.lines.map((l) => ({
      hsn: l.product.hsnCode,
      description: l.product.name || l.description,
      unit: l.product.unit,
      quantity: num(l.quantity),
      taxable: num(l.lineTotal),
      rate: num(l.taxRate),
      tax: num(l.taxAmount),
    })),
  }));
  const purchases: GstPurchaseInvoice[] = bills.map((b) => ({
    id: b.id,
    number: b.number,
    supplierInvoiceNo: b.supplierInvoiceNo,
    date: isoFromDay(b.invoiceDate),
    status: b.status,
    supplierName: b.supplier.name,
    supplierGstin: b.supplier.gstin,
    supplierState: b.supplier.state,
    placeOfSupply: b.placeOfSupply,
    itcEligible: b.itcEligible,
    taxable: num(b.subtotal),
    tax: num(b.taxTotal),
    total: num(b.total),
  }));

  const opts = { companyState: company?.state ?? null };
  const gstr1 = buildGstr1(period, sales, opts);
  const gstr3b = buildGstr3b(gstr1, purchases, opts);
  return {
    company: { name: company?.legalName || company?.name || "", gstin: company?.gstin ?? null, state: company?.state ?? null },
    gstr1,
    gstr3b,
    filings: {
      gstr1: filings.find((f) => f.type === "GSTR-1") ?? null,
      gstr3b: filings.find((f) => f.type === "GSTR-3B") ?? null,
    },
  };
}

export type GstData = Awaited<ReturnType<typeof loadGstReturns>>;

/** Compact figures stored in GstReturn.snapshot when a return is marked as filed. */
export function snapshotOf(data: GstData, type: "GSTR-1" | "GSTR-3B") {
  if (type === "GSTR-1") {
    const g = data.gstr1;
    return {
      totals: g.totals,
      b2b: g.b2b.map((r) => ({ ...r, items: undefined })),
      b2cl: g.b2cl.map((r) => ({ ...r, items: undefined })),
      b2cs: g.b2cs,
      hsn: g.hsn,
      docs: g.docs,
    };
  }
  const g = data.gstr3b;
  return { outward: g.outward, nilRated: g.nilRated, itc: g.itc, ineligible: g.ineligible, setOff: g.setOff, netPayable: g.netPayable };
}

/** Key figures to compare a filed snapshot with today's figures. */
export function keyFigures(data: GstData, type: "GSTR-1" | "GSTR-3B") {
  if (type === "GSTR-1") {
    const t = data.gstr1.totals;
    return { taxable: t.taxable, igst: t.igst, cgst: t.cgst, sgst: t.sgst };
  }
  const o = data.gstr3b.outward;
  return { taxable: o.taxable, igst: o.igst, cgst: o.cgst, sgst: o.sgst, netPayable: data.gstr3b.netPayable };
}
