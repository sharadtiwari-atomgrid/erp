import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { buildLedgerMastersXml, buildSalesVouchersXml, DEFAULT_LEDGERS, type TallyLedgerNames } from "../../_lib/tally";
import { attachment, loadInvoicesForExport, readExportParams, toSalesVoucher } from "../data";

/**
 * GET /books/export/tally?from=YYYY-MM-DD&to=YYYY-MM-DD&branch=<id>&kind=vouchers|masters
 * Downloads Tally "Import Data" XML: Sales vouchers, or the ledger masters they use.
 */
export async function GET(request: NextRequest) {
  const user = await requireUser("eWayBills");
  const url = request.nextUrl;
  const params = readExportParams(url, user);
  const ledger = (key: keyof TallyLedgerNames) => url.searchParams.get(`${key}Ledger`)?.trim() || DEFAULT_LEDGERS[key];
  const ledgers: TallyLedgerNames = {
    sales: ledger("sales"),
    cgst: ledger("cgst"),
    sgst: ledger("sgst"),
    igst: ledger("igst"),
    roundOff: ledger("roundOff"),
  };

  const { company, invoices } = await loadInvoicesForExport(params);
  const companyName = company.legalName ?? company.name;
  const range = `${params.fromLabel}-${params.toLabel}`;

  if (url.searchParams.get("kind") === "masters") {
    const parties = new Map<string, { name: string; gstin: string | null; state: string | null; address: string | null }>();
    for (const inv of invoices) {
      if (!parties.has(inv.customer.name)) {
        parties.set(inv.customer.name, {
          name: inv.customer.name,
          gstin: inv.customer.gstin,
          state: inv.customer.state,
          address: [inv.customer.billingAddress, inv.customer.city].filter(Boolean).join(", ") || null,
        });
      }
    }
    return attachment(buildLedgerMastersXml(companyName, [...parties.values()], ledgers), `tally-ledgers-${range}.xml`, "application/xml; charset=utf-8");
  }

  return attachment(buildSalesVouchersXml(companyName, invoices.map(toSalesVoucher), ledgers), `tally-sales-${range}.xml`, "application/xml; charset=utf-8");
}
