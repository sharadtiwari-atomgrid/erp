import type { Metadata } from "next";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, FormGrid, Input, Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getBranchScope } from "@/lib/branch";
import { getBranchOptions } from "@/lib/options";
import { DEFAULT_LEDGERS } from "../_lib/tally";
import { istDate } from "./data";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Tally export" };

export default async function ExportPage() {
  const user = await requireUser("eWayBills");
  const [scope, branches] = await Promise.all([getBranchScope(), getBranchOptions()]);
  const today = istDate(new Date());
  const monthStart = `${today.slice(0, 8)}01`;
  const lockedBranch = user.branchId ? branches.find((b) => b.id === user.branchId) : null;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Tally export"
        description="Download sales vouchers as Tally XML, or invoices and payments as CSV."
      />
      <div className="mb-6 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        Tally (Gateway of Tally → Import → Vouchers / Masters) can import the XML files directly; any other accounting software or a spreadsheet can
        import the CSV files. Only issued, part-paid and paid invoices are exported: drafts and cancelled invoices are skipped.
      </div>

      <form action="/books/export/tally" method="get" className="space-y-6">
        <Card>
          <CardHeader title="Period and branch" description="Dates are invoice dates (payment dates for the payments CSV), in IST." />
          <CardBody>
            <FormGrid className="sm:grid-cols-3">
              <Field label="From" htmlFor="from">
                <Input id="from" name="from" type="date" defaultValue={monthStart} />
              </Field>
              <Field label="To" htmlFor="to">
                <Input id="to" name="to" type="date" defaultValue={today} />
              </Field>
              <Field label="Branch" htmlFor="branch">
                {lockedBranch ? (
                  <Input id="branch" value={lockedBranch.name} disabled />
                ) : (
                  <Select id="branch" name="branch" defaultValue={scope.branchId ?? ""}>
                    <option value="">All branches</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </FormGrid>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Tally XML"
            description="One Sales voucher per invoice: customer ledger debited with the total; sales and CGST/SGST or IGST ledgers credited. Ledger names must match those in Tally."
          />
          <CardBody className="space-y-4">
            <FormGrid className="sm:grid-cols-3">
              <Field label="Sales ledger" htmlFor="salesLedger">
                <Input id="salesLedger" name="salesLedger" defaultValue={DEFAULT_LEDGERS.sales} />
              </Field>
              <Field label="CGST ledger" htmlFor="cgstLedger">
                <Input id="cgstLedger" name="cgstLedger" defaultValue={DEFAULT_LEDGERS.cgst} />
              </Field>
              <Field label="SGST ledger" htmlFor="sgstLedger">
                <Input id="sgstLedger" name="sgstLedger" defaultValue={DEFAULT_LEDGERS.sgst} />
              </Field>
              <Field label="IGST ledger" htmlFor="igstLedger">
                <Input id="igstLedger" name="igstLedger" defaultValue={DEFAULT_LEDGERS.igst} />
              </Field>
              <Field label="Round-off ledger" htmlFor="roundOffLedger" hint="Used only if an invoice is off by paise">
                <Input id="roundOffLedger" name="roundOffLedger" defaultValue={DEFAULT_LEDGERS.roundOff} />
              </Field>
            </FormGrid>
            <div className="flex flex-wrap gap-2">
              <button type="submit" name="kind" value="vouchers" className={buttonClass("primary")}>
                Download sales vouchers (XML)
              </button>
              <button type="submit" name="kind" value="masters" className={buttonClass("secondary")}>
                Download ledger masters (XML)
              </button>
            </div>
            <p className="text-xs text-ink-faint">
              Import the ledger masters first if the customers or GST ledgers don’t exist in Tally yet. Party ledgers are named exactly as the customer.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="CSV" description="UTF-8 with a header row; opens in Excel or Google Sheets." />
          <CardBody>
            <div className="flex flex-wrap gap-2">
              <button type="submit" formAction="/books/export/csv" name="type" value="invoices" className={buttonClass("secondary")}>
                Invoices (CSV)
              </button>
              <button type="submit" formAction="/books/export/csv" name="type" value="payments" className={buttonClass("secondary")}>
                Payments (CSV)
              </button>
            </div>
          </CardBody>
        </Card>
      </form>
    </div>
  );
}
