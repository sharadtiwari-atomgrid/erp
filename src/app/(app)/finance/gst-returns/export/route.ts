import type { NextRequest } from "next/server";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { formatDmy } from "@/lib/ops/dates";
import { cell } from "../../reports/_lib/amount";
import { financeExportGuard, xlsxResponse, type Sheet } from "../../reports/_lib/xlsx";
import { loadGstReturns, resolvePeriod } from "../_lib/load";

const tax = (t: { igst: number; cgst: number; sgst: number }) => ({ IGST: cell(t.igst), CGST: cell(t.cgst), SGST: cell(t.sgst) });

/** GET /finance/gst-returns/export?period=YYYY-MM&type=gstr1|gstr3b — every table of the return as a sheet. */
export async function GET(request: NextRequest) {
  const denied = await financeExportGuard();
  if (denied) return denied;
  await ensureFinanceSetup();
  const sp = request.nextUrl.searchParams;
  const period = resolvePeriod(sp.get("period"));
  const data = await loadGstReturns(period);

  if (sp.get("type") === "gstr3b") {
    const g = data.gstr3b;
    const s = g.setOff;
    const sheets: Sheet[] = [
      {
        name: "3.1 Outward",
        rows: [
          { Nature: "(a) Outward taxable supplies", "Taxable value": g.outward.taxable, ...tax(g.outward) },
          { Nature: "(c) Nil rated / exempted", "Taxable value": g.nilRated, IGST: 0, CGST: 0, SGST: 0 },
        ],
      },
      {
        name: "4 ITC",
        rows: [
          { Details: "(A)(5) All other ITC", ...tax(g.itc) },
          { Details: "(D) Ineligible ITC", ...tax(g.ineligible) },
          { Details: "(C) Net ITC available", ...tax(g.itc) },
        ],
      },
      {
        name: "6.1 Payment of tax",
        rows: (["igst", "cgst", "sgst"] as const).map((h) => ({
          Head: h.toUpperCase(),
          "Tax payable": s.liability[h],
          "Paid by IGST credit": s.utilised.igst[h],
          "Paid by CGST credit": s.utilised.cgst[h],
          "Paid by SGST credit": s.utilised.sgst[h],
          "Payable in cash": s.cash[h],
          "Credit carried forward": s.carryForward[h],
        })),
      },
      {
        name: "ITC register",
        rows: g.itcRows.map((r) => ({
          Bill: r.number,
          "Supplier invoice": r.supplierInvoiceNo ?? "",
          Supplier: r.supplierName,
          GSTIN: r.supplierGstin ?? "",
          Date: formatDmy(r.date),
          "Taxable value": r.taxable,
          ...tax(r),
        })),
      },
    ];
    return xlsxResponse(`GSTR-3B ${period}`, sheets);
  }

  const g = data.gstr1;
  const pos = (code: string, name: string) => (code ? `${code}-${name}` : name);
  const sheets: Sheet[] = [
    {
      name: "b2b",
      rows: g.b2b.map((r) => ({
        GSTIN: r.gstin,
        Customer: r.customerName,
        "Invoice no.": r.number,
        "Invoice date": formatDmy(r.date),
        "Invoice value": r.value,
        "Place of supply": pos(r.posCode, r.placeOfSupply),
        "Taxable value": r.taxable,
        ...tax(r),
      })),
    },
    {
      name: "b2cl",
      rows: g.b2cl.map((r) => ({
        "Invoice no.": r.number,
        "Invoice date": formatDmy(r.date),
        Customer: r.customerName,
        "Invoice value": r.value,
        "Place of supply": pos(r.posCode, r.placeOfSupply),
        "Taxable value": r.taxable,
        ...tax(r),
      })),
    },
    {
      name: "b2cs",
      rows: g.b2cs.map((r) => ({
        "Place of supply": pos(r.posCode, r.placeOfSupply),
        Type: r.interState ? "INTER" : "INTRA",
        Rate: r.rate,
        "Taxable value": r.taxable,
        ...tax(r),
      })),
    },
    {
      name: "hsn",
      rows: g.hsn.map((r) => ({
        HSN: r.hsn,
        Description: r.description,
        UQC: r.uqc,
        Quantity: r.quantity,
        Rate: r.rate,
        "Total value": r.value,
        "Taxable value": r.taxable,
        ...tax(r),
      })),
    },
    {
      name: "docs",
      rows: g.docs.map((d) => ({ Series: d.series, From: d.from, To: d.to, Total: d.total, Cancelled: d.cancelled, "Net issued": d.net })),
    },
  ];
  return xlsxResponse(`GSTR-1 ${period}`, sheets);
}
