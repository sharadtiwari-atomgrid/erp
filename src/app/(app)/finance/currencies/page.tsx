import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { formatNumber, num } from "@/lib/format";
import { formatDmy, isoFromDay, todayIso } from "@/lib/ops/dates";
import { can } from "@/lib/permissions";
import { InlineForm } from "../_gl/inline-form";
import { addCurrency, setRate, updateCurrency } from "./actions";
import { Converter } from "./converter";

export const metadata: Metadata = { title: "Currencies" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinanceCurrenciesPage() {
  const user = await requireUser("finance", "view");
  await ensureFinanceSetup();
  const canEdit = can(user, "finance", "edit");
  const today = todayIso();
  const currencies = await db.currency.findMany({
    orderBy: [{ isBase: "desc" }, { code: "asc" }],
    include: { rates: { orderBy: { date: "desc" }, take: 12 } },
  });
  const latest = currencies.map((c) => ({ code: c.code, rate: c.isBase ? 1 : c.rates[0] ? num(c.rates[0].rate) : null }));

  return (
    <>
      <PageHeader title="Currencies" description="Foreign currencies and exchange rates in rupees per unit. INR is the base currency." />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Converter" description="Uses each currency’s latest rate." />
          <CardBody>
            <Converter rates={latest.filter((r) => currencies.find((c) => c.code === r.code)?.isActive)} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Currencies" />
          <Table>
            <THead>
              <tr>
                <TH>Code</TH>
                <TH>Name</TH>
                <TH>Symbol</TH>
                <TH align="right">Latest rate (₹)</TH>
                <TH>As on</TH>
                {canEdit && <TH>Edit</TH>}
              </tr>
            </THead>
            <TBody>
              {currencies.map((c) => (
                <TR key={c.code}>
                  <TD className="font-medium">
                    {c.code}
                    {c.isBase && (
                      <span className="ml-2">
                        <Badge tone="blue">Base</Badge>
                      </span>
                    )}
                    {!c.isActive && (
                      <span className="ml-2">
                        <Badge>Inactive</Badge>
                      </span>
                    )}
                  </TD>
                  <TD>{c.name}</TD>
                  <TD>{c.symbol ?? "—"}</TD>
                  <TD align="right">{c.isBase ? "1" : c.rates[0] ? formatNumber(c.rates[0].rate, 6) : "—"}</TD>
                  <TD className="text-ink-soft">{c.isBase ? "—" : c.rates[0] ? formatDmy(c.rates[0].date) : "No rate yet"}</TD>
                  {canEdit && (
                    <TD>
                      {c.isBase ? (
                        <span className="text-xs text-ink-faint">Fixed</span>
                      ) : (
                        <InlineForm action={updateCurrency.bind(null, c.code)} submitLabel="Save">
                          <Input name="name" defaultValue={c.name} aria-label={`${c.code} name`} className="h-8 w-40" required />
                          <Input name="symbol" defaultValue={c.symbol ?? ""} aria-label={`${c.code} symbol`} className="h-8 w-16" />
                          <label className="flex items-center gap-1.5 text-xs text-ink">
                            <input type="checkbox" name="isActive" defaultChecked={c.isActive} className="h-4 w-4 rounded border-line" />
                            Active
                          </label>
                        </InlineForm>
                      )}
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
          {canEdit && (
            <CardBody className="border-t border-line">
              <InlineForm action={addCurrency} submitLabel="Add currency">
                <Input name="code" placeholder="Code (e.g. GBP)" aria-label="Currency code" className="h-8 w-36" maxLength={3} required />
                <Input name="name" placeholder="Name" aria-label="Currency name" className="h-8 w-48" required />
                <Input name="symbol" placeholder="Symbol" aria-label="Currency symbol" className="h-8 w-20" />
              </InlineForm>
            </CardBody>
          )}
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {currencies
            .filter((c) => !c.isBase)
            .map((c) => (
              <Card key={c.code}>
                <CardHeader title={`${c.code} exchange rates`} description={`Rupees per 1 ${c.code}`} />
                <Table>
                  <THead>
                    <tr>
                      <TH>Posting Date</TH>
                      <TH align="right">Rate</TH>
                      {canEdit && <TH align="right">Edit</TH>}
                    </tr>
                  </THead>
                  <TBody>
                    {c.rates.length === 0 && <EmptyRow colSpan={canEdit ? 3 : 2}>No rates yet.</EmptyRow>}
                    {c.rates.map((r) => (
                      <TR key={r.id}>
                        <TD>{formatDmy(r.date)}</TD>
                        <TD align="right">{formatNumber(r.rate, 6)}</TD>
                        {canEdit && (
                          <TD align="right">
                            <div className="flex justify-end">
                              <InlineForm action={setRate.bind(null, c.code)} submitLabel="Update">
                                <input type="hidden" name="date" value={isoFromDay(r.date)} />
                                <Input name="rate" type="number" step="0.000001" min="0" defaultValue={num(r.rate)} aria-label={`Rate on ${formatDmy(r.date)}`} className="h-8 w-32 text-right" required />
                              </InlineForm>
                            </div>
                          </TD>
                        )}
                      </TR>
                    ))}
                  </TBody>
                </Table>
                {canEdit && (
                  <CardBody className="border-t border-line">
                    <InlineForm action={setRate.bind(null, c.code)} submitLabel="Add rate">
                      <Input name="date" type="date" defaultValue={today} aria-label="Rate date" className="h-8 w-40" required />
                      <Input name="rate" type="number" step="0.000001" min="0" placeholder="Rate" aria-label="Rate" className="h-8 w-32 text-right" required />
                    </InlineForm>
                  </CardBody>
                )}
              </Card>
            ))}
        </div>
      </div>
    </>
  );
}
