import Link from "next/link";
import type { Metadata } from "next";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { YEAR_END_CLOSE } from "@/lib/finance/closing";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { formatDateTime } from "@/lib/format";
import { formatDmy, todayIso } from "@/lib/ops/dates";
import { can } from "@/lib/permissions";
import { closePeriodsThrough, closeYear, createNextYear, reopenYear, setPeriodClosed } from "./actions";

export const metadata: Metadata = { title: "Accounting periods" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinancePeriodsPage() {
  const user = await requireUser("finance", "view");
  await ensureFinanceSetup();
  const canEdit = can(user, "finance", "edit");
  const today = todayIso();
  const [years, closings, counts] = await Promise.all([
    db.fiscalYear.findMany({ orderBy: { startDate: "desc" }, include: { periods: { orderBy: { startDate: "asc" } } } }),
    db.glEntry.findMany({ where: { documentType: YEAR_END_CLOSE, sourceType: "FiscalYear", reversed: false }, distinct: ["sourceId"], select: { sourceId: true, transactionNo: true } }),
    db.$queryRaw<Array<{ start: Date; n: bigint }>>`SELECT date_trunc('month', "postingDate")::date AS start, COUNT(*)::bigint AS n FROM "GlEntry" GROUP BY 1`,
  ]);
  const closingTx = new Map(closings.map((c) => [c.sourceId, c.transactionNo]));
  const entriesIn = new Map(counts.map((c) => [new Date(c.start).toISOString().slice(0, 10), Number(c.n)]));

  return (
    <>
      <PageHeader
        title="Accounting periods"
        description="April–March financial years. Closed periods reject postings; closing a year moves income and expenses to retained earnings."
        actions={canEdit && <ActionButton action={createNextYear} variant="primary">Create next year</ActionButton>}
      />
      <div className="space-y-6">
        {years.map((fy) => {
          const open = fy.periods.filter((p) => !p.closed).length;
          const txNo = closingTx.get(fy.id);
          return (
            <Card key={fy.id}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    {fy.name}
                    {fy.closed ? <Badge tone="red">Closed</Badge> : <Badge tone="green">Open</Badge>}
                    {!fy.closed && open < 12 && <Badge tone="amber">{12 - open} of 12 periods closed</Badge>}
                  </span>
                }
                description={
                  <>
                    {formatDmy(fy.startDate)} – {formatDmy(fy.endDate)}
                    {fy.closedAt && ` · closed ${formatDateTime(fy.closedAt)}`}
                    {txNo && (
                      <>
                        {" · "}
                        <Link href={`/finance/entries?transactionNo=${txNo}`} className="text-brand-700 hover:underline">
                          closing transaction {txNo}
                        </Link>
                      </>
                    )}
                  </>
                }
                actions={
                  canEdit &&
                  (fy.closed ? (
                    <ActionButton action={reopenYear.bind(null, fy.id)} confirmMessage={`Reopen ${fy.name}? The year-end closing transaction will be reversed.`}>
                      Reopen year
                    </ActionButton>
                  ) : (
                    <ActionButton
                      action={closeYear.bind(null, fy.id)}
                      variant="primary"
                      pendingText="Closing…"
                      disabled={open > 0}
                      title={open > 0 ? "Close all 12 periods first" : undefined}
                      confirmMessage={`Close ${fy.name}? Income and expense balances will be transferred to retained earnings on ${formatDmy(fy.endDate)}.`}
                    >
                      Year-end close
                    </ActionButton>
                  ))
                }
              />
              <Table>
                <THead>
                  <tr>
                    <TH>Period</TH>
                    <TH>From</TH>
                    <TH>To</TH>
                    <TH align="right">Entries</TH>
                    <TH>Status</TH>
                    <TH align="right">{canEdit ? "Actions" : ""}</TH>
                  </tr>
                </THead>
                <TBody>
                  {fy.periods.map((p) => {
                    const iso = p.startDate.toISOString().slice(0, 10);
                    const current = today >= iso && today <= p.endDate.toISOString().slice(0, 10);
                    return (
                      <TR key={p.id}>
                        <TD className="font-medium">
                          {p.name}
                          {current && (
                            <span className="ml-2">
                              <Badge tone="blue">Current</Badge>
                            </span>
                          )}
                        </TD>
                        <TD className="text-ink-soft">{formatDmy(p.startDate)}</TD>
                        <TD className="text-ink-soft">{formatDmy(p.endDate)}</TD>
                        <TD align="right">
                          {entriesIn.get(iso) ? (
                            <Link href={`/finance/entries?from=${iso}&to=${p.endDate.toISOString().slice(0, 10)}`} className="text-brand-700 hover:underline">
                              {entriesIn.get(iso)}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </TD>
                        <TD>{p.closed ? <Badge tone="red">Closed</Badge> : <Badge tone="green">Open</Badge>}</TD>
                        <TD align="right">
                          {canEdit && !fy.closed && (
                            <span className="inline-flex gap-2">
                              {!p.closed && (
                                <ActionButton action={closePeriodsThrough.bind(null, p.id)} size="sm" variant="ghost" confirmMessage={`Close every open period of ${fy.name} up to ${p.name}?`}>
                                  Close through
                                </ActionButton>
                              )}
                              <ActionButton action={setPeriodClosed.bind(null, p.id, !p.closed)} size="sm">
                                {p.closed ? "Reopen" : "Close"}
                              </ActionButton>
                            </span>
                          )}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </Card>
          );
        })}
      </div>
    </>
  );
}
