import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { num } from "@/lib/format";
import { round2 } from "@/lib/totals";
import { toCsv } from "../../_lib/tally";
import { attachment, istDate, loadInvoicesForExport, loadPaymentsForExport, readExportParams } from "../data";

/** GET /books/export/csv?type=invoices|payments&from&to&branch — spreadsheet-friendly CSV. */
export async function GET(request: NextRequest) {
  const user = await requireUser("eWayBills");
  const url = request.nextUrl;
  const params = readExportParams(url, user);
  const range = `${params.fromLabel}-${params.toLabel}`;

  if (url.searchParams.get("type") === "payments") {
    const payments = await loadPaymentsForExport(params);
    const csv = toCsv(
      ["Date", "Invoice", "Customer", "Customer GSTIN", "Branch", "Method", "Reference", "Amount", "Notes"],
      payments.map((p) => [
        istDate(p.date),
        p.invoice.number,
        p.invoice.customer.name,
        p.invoice.customer.gstin,
        p.invoice.branch.code,
        p.method,
        p.reference,
        num(p.amount).toFixed(2),
        p.notes,
      ]),
    );
    return attachment(csv, `payments-${range}.csv`, "text/csv; charset=utf-8");
  }

  const { invoices } = await loadInvoicesForExport(params);
  const csv = toCsv(
    [
      "Invoice",
      "Date",
      "Due date",
      "Customer",
      "Customer GSTIN",
      "Place of supply",
      "Branch",
      "Status",
      "Taxable value",
      "CGST",
      "SGST",
      "IGST",
      "Total",
      "Paid",
      "Balance",
    ],
    invoices.map((inv) => [
      inv.number,
      istDate(inv.issueDate),
      inv.dueDate ? istDate(inv.dueDate) : "",
      inv.customer.name,
      inv.customer.gstin,
      inv.placeOfSupply,
      inv.branch.code,
      inv.status,
      num(inv.subtotal).toFixed(2),
      inv.gst.cgst.toFixed(2),
      inv.gst.sgst.toFixed(2),
      inv.gst.igst.toFixed(2),
      num(inv.total).toFixed(2),
      num(inv.amountPaid).toFixed(2),
      round2(num(inv.total) - num(inv.amountPaid)).toFixed(2),
    ]),
  );
  return attachment(csv, `invoices-${range}.csv`, "text/csv; charset=utf-8");
}
