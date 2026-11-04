import Link from "next/link";
import type { Metadata } from "next";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { formatDmy } from "@/lib/ops/dates";
import { can } from "@/lib/permissions";
import { glBalances, OPENING_BATCH } from "../_cash_fa/server";
import { Amount } from "../_cash_fa/ui";

export const metadata: Metadata = { title: "Bank accounts" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function BankAccountsPage() {
  const user = await requireUser("finance");
  await ensureFinanceSetup();
  const accounts = await db.bankAccount.findMany({
    orderBy: [{ isActive: "desc" }, { kind: "asc" }, { code: "asc" }],
    include: { glAccount: { select: { code: true, name: true } } },
  });
  const [balances, unmatched, lastRecs] = await Promise.all([
    glBalances(accounts.map((a) => a.glAccountId)),
    db.bankStatementLine.groupBy({ by: ["bankAccountId"], where: { status: "UNMATCHED", importBatch: { not: OPENING_BATCH } }, _count: true }),
    db.bankReconciliation.groupBy({ by: ["bankAccountId"], where: { status: "COMPLETED" }, _max: { statementDate: true } }),
  ]);
  const unmatchedBy = new Map(unmatched.map((u) => [u.bankAccountId, u._count]));
  const lastBy = new Map(lastRecs.map((r) => [r.bankAccountId, r._max.statementDate]));
  const total = (kind: string) => accounts.filter((a) => a.kind === kind && a.isActive).reduce((s, a) => s + (balances.get(a.glAccountId) ?? 0), 0);
  const canEdit = can(user, "finance", "edit");

  return (
    <>
      <PageHeader
        title="Bank accounts"
        description="Company bank and cash accounts. Each balance is the balance of its ledger account."
        actions={
          canEdit && (
            <>
              <ButtonLink href="/finance/bank-accounts/transfer" variant="secondary">
                Transfer between accounts
              </ButtonLink>
              <ButtonLink href="/finance/bank-accounts/new">New bank account</ButtonLink>
            </>
          )
        }
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Bank balances" value={<Amount value={total("BANK")} />} />
        <StatCard label="Cash balances" value={<Amount value={total("CASH")} />} />
        <StatCard label="Total cash & bank" value={<Amount value={total("BANK") + total("CASH")} />} hint={`${accounts.filter((a) => a.isActive).length} active accounts`} />
      </div>
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Code</TH>
              <TH>Name</TH>
              <TH>Bank / account no.</TH>
              <TH>Ledger account</TH>
              <TH align="right">Balance</TH>
              <TH align="right">Unmatched lines</TH>
              <TH>Last reconciled</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {accounts.length === 0 && <EmptyRow colSpan={8} />}
            {accounts.map((a) => (
              <TR key={a.id}>
                <TD className="font-mono text-xs text-ink-soft">{a.code}</TD>
                <TD>
                  <Link href={`/finance/bank-accounts/${a.id}`} className="font-medium text-brand-700 hover:underline">
                    {a.name}
                  </Link>{" "}
                  {a.kind === "CASH" && <Badge>Cash</Badge>}
                </TD>
                <TD className="text-ink-soft">
                  <div>{a.bankName ?? "—"}</div>
                  {a.accountNo && <div className="font-mono text-xs">{a.accountNo}</div>}
                </TD>
                <TD className="text-ink-soft">
                  <span className="font-mono text-xs">{a.glAccount.code}</span> {a.glAccount.name}
                </TD>
                <TD align="right">
                  <Amount value={balances.get(a.glAccountId) ?? 0} />
                </TD>
                <TD align="right">
                  {unmatchedBy.get(a.id) ? (
                    <Link href={`/finance/bank-reconciliation/${a.id}`} className="text-brand-700 hover:underline">
                      {unmatchedBy.get(a.id)}
                    </Link>
                  ) : (
                    <span className="text-ink-faint">—</span>
                  )}
                </TD>
                <TD className="text-ink-soft">{lastBy.get(a.id) ? formatDmy(lastBy.get(a.id)) : "Never"}</TD>
                <TD>
                  <StatusBadge status={a.isActive ? "ACTIVE" : "INACTIVE"} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
      <p className="mt-3 text-xs text-ink-faint">Totals include active accounts only.</p>
    </>
  );
}
