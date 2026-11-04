import Link from "next/link";
import type { Metadata } from "next";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { formatMoney } from "@/lib/format";
import { param } from "@/lib/forms";
import { formatDmy } from "@/lib/ops/dates";
import { can } from "@/lib/permissions";
import { glBalances, OPENING_BATCH } from "../_cash_fa/server";
import { Amount } from "../_cash_fa/ui";
import { StatementImport } from "./statement-import";

export const metadata: Metadata = { title: "Bank reconciliation" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function BankReconciliationPage({ searchParams }: PageProps<"/finance/bank-reconciliation">) {
  const user = await requireUser("finance");
  await ensureFinanceSetup();
  const sp = await searchParams;
  const banks = await db.bankAccount.findMany({ where: { isActive: true }, orderBy: [{ kind: "asc" }, { code: "asc" }] });
  const [balances, unmatched, lastLines, lastRecs, history] = await Promise.all([
    glBalances(banks.map((b) => b.glAccountId)),
    db.bankStatementLine.groupBy({ by: ["bankAccountId"], where: { status: "UNMATCHED" }, _count: true }),
    db.bankStatementLine.groupBy({ by: ["bankAccountId"], where: { importBatch: { not: OPENING_BATCH } }, _max: { date: true } }),
    db.bankReconciliation.groupBy({ by: ["bankAccountId"], where: { status: "COMPLETED" }, _max: { statementDate: true } }),
    db.bankReconciliation.findMany({ orderBy: [{ statementDate: "desc" }, { createdAt: "desc" }], take: 50, include: { bankAccount: { select: { id: true, code: true, name: true } } } }),
  ]);
  const unmatchedBy = new Map(unmatched.map((u) => [u.bankAccountId, u._count]));
  const lastLineBy = new Map(lastLines.map((u) => [u.bankAccountId, u._max.date]));
  const lastRecBy = new Map(lastRecs.map((u) => [u.bankAccountId, u._max.statementDate]));

  return (
    <>
      <PageHeader title="Bank reconciliation" description="Import bank statements, match them to the ledger and reconcile each account to its statement balance." />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Accounts" />
          <Table>
            <THead>
              <tr>
                <TH>Account</TH>
                <TH align="right">Book balance</TH>
                <TH align="right">Unmatched lines</TH>
                <TH>Statement up to</TH>
                <TH>Reconciled up to</TH>
                <TH />
              </tr>
            </THead>
            <TBody>
              {banks.length === 0 && <EmptyRow colSpan={6} />}
              {banks.map((b) => (
                <TR key={b.id}>
                  <TD>
                    <span className="font-mono text-xs text-ink-soft">{b.code}</span> <span className="font-medium">{b.name}</span>
                  </TD>
                  <TD align="right">
                    <Amount value={balances.get(b.glAccountId) ?? 0} />
                  </TD>
                  <TD align="right">{unmatchedBy.get(b.id) ?? <span className="text-ink-faint">—</span>}</TD>
                  <TD className="text-ink-soft">{lastLineBy.get(b.id) ? formatDmy(lastLineBy.get(b.id)) : "No statement"}</TD>
                  <TD className="text-ink-soft">{lastRecBy.get(b.id) ? formatDmy(lastRecBy.get(b.id)) : "Never"}</TD>
                  <TD align="right">
                    <Link href={`/finance/bank-reconciliation/${b.id}`} className="font-medium text-brand-700 hover:underline">
                      Reconcile
                    </Link>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>

        {can(user, "finance", "edit") && (
          <StatementImport banks={banks.map((b) => ({ id: b.id, code: b.code, name: b.name, kind: b.kind }))} defaultBankId={param(sp, "bank") || undefined} />
        )}

        <Card>
          <CardHeader title="Reconciliation history" />
          <Table>
            <THead>
              <tr>
                <TH>Account</TH>
                <TH>Statement date</TH>
                <TH align="right">Statement balance</TH>
                <TH align="right">Book balance</TH>
                <TH align="right">Difference</TH>
                <TH>Completed</TH>
                <TH>Notes</TH>
              </tr>
            </THead>
            <TBody>
              {history.length === 0 && <EmptyRow colSpan={7}>No reconciliations yet.</EmptyRow>}
              {history.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link href={`/finance/bank-reconciliation/${r.bankAccount.id}`} className="text-brand-700 hover:underline">
                      {r.bankAccount.name}
                    </Link>
                  </TD>
                  <TD>{formatDmy(r.statementDate)}</TD>
                  <TD align="right">{formatMoney(r.statementBalance)}</TD>
                  <TD align="right">{formatMoney(r.bookBalance)}</TD>
                  <TD align="right">{formatMoney(r.difference)}</TD>
                  <TD className="text-ink-soft">{r.completedAt ? formatDmy(r.completedAt) : r.status}</TD>
                  <TD className="text-xs text-ink-soft">{r.notes}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>
    </>
  );
}
