import type { Metadata } from "next";
import { Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { tdsQuarterOf } from "@/lib/finance/chart";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { formatMoney } from "@/lib/format";
import { param } from "@/lib/forms";
import { todayIso } from "@/lib/ops/dates";
import { amt } from "../../reports/_lib/amount";
import { TaxNav } from "../_lib/nav";
import { loadQuarterSummary } from "../_lib/summary";
import { kindOf, recentQuarters, returnForm } from "../_lib/tds";

export const metadata: Metadata = { title: "TDS & TCS Quarterly Summary" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function TdsSummaryPage({ searchParams }: PageProps<"/finance/tds/summary">) {
  await requireUser("finance");
  await ensureFinanceSetup();
  const sp = await searchParams;
  const kind = kindOf(param(sp, "kind"));
  const today = todayIso();
  const quarters = recentQuarters(today);
  const requested = param(sp, "quarter");
  const quarter = requested && requested !== "all" ? requested : tdsQuarterOf(today);
  if (!quarters.includes(quarter)) quarters.push(quarter);
  const summary = await loadQuarterSummary(kind, quarter);
  const party = kind === "TCS" ? "Collectee" : "Deductee";

  return (
    <>
      <PageHeader
        title={`${returnForm(kind)} summary`}
        description={`${kind} per section and ${party.toLowerCase()} for ${quarter}. Prepare the return in the department's utility from this.`}
        back={{ href: "/finance", label: "Finance" }}
        actions={
          <>
            <form className="flex items-center gap-2">
              <input type="hidden" name="kind" value={kind} />
              <Select name="quarter" defaultValue={quarter} className="w-44" aria-label="Quarter">
                {quarters.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </Select>
              <button type="submit" className={buttonClass("secondary")}>
                Show
              </button>
            </form>
            <ButtonLink variant="secondary" href={`/finance/tds/summary/export?kind=${kind}&quarter=${encodeURIComponent(quarter)}`} prefetch={false}>
              Export to Excel
            </ButtonLink>
          </>
        }
      />
      <TaxNav kind={kind} current="summary" quarter={quarter} />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Amount paid / credited" value={formatMoney(summary.grand.base)} />
        <StatCard label={`${kind} deducted`} value={formatMoney(summary.grand.tax)} />
        <StatCard label="Deposited" value={formatMoney(summary.grand.deposited)} />
        <StatCard
          label="Return status"
          value={
            summary.status === "FILED" ? <Badge tone="green">Filed</Badge> : summary.status === "PENDING" ? <Badge tone="amber">Deposit pending</Badge> : summary.status === "DEPOSITED" ? <Badge tone="blue">Ready to file</Badge> : <Badge>No entries</Badge>
          }
        />
      </div>
      {summary.missingPan && (
        <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Some {party.toLowerCase()}s have no PAN. Add it on the contact before filing; without a PAN a higher rate applies.
        </p>
      )}
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>{party}</TH>
              <TH>PAN</TH>
              <TH>GSTIN</TH>
              <TH align="right">Entries</TH>
              <TH align="right">Amount paid</TH>
              <TH align="right">{kind}</TH>
              <TH align="right">Deposited</TH>
              <TH>Challans</TH>
            </tr>
          </THead>
          <TBody>
            {summary.sections.length === 0 && <EmptyRow colSpan={8}>No {kind} entries in {quarter}.</EmptyRow>}
            {summary.sections.map((s) => (
              <Fragment key={s.code}>
                <tr className="bg-muted/30">
                  <td colSpan={8} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink">
                    Section {s.code} · {s.description}
                  </td>
                </tr>
                {s.rows.map((r) => (
                  <TR key={r.contactId}>
                    <TD className="pl-8">{r.name}</TD>
                    <TD className="font-mono text-xs">{r.pan ?? <span className="text-red-600">Missing</span>}</TD>
                    <TD className="font-mono text-xs text-ink-soft">{r.gstin ?? "—"}</TD>
                    <TD align="right">{r.entries}</TD>
                    <TD align="right">{amt(r.base)}</TD>
                    <TD align="right">{amt(r.tax)}</TD>
                    <TD align="right" className={r.deposited < r.tax ? "text-amber-700" : ""}>
                      {amt(r.deposited, { zero: "0.00" })}
                    </TD>
                    <TD className="text-xs text-ink-soft">{r.challans.join(", ") || "—"}</TD>
                  </TR>
                ))}
                <tr className="bg-muted/40 font-semibold">
                  <td className="px-4 py-2 pl-8" colSpan={3}>
                    Total {s.code}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{s.total.entries}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{amt(s.total.base)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{amt(s.total.tax)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{amt(s.total.deposited, { zero: "0.00" })}</td>
                  <td />
                </tr>
              </Fragment>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
