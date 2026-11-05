import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/ui/badge";
import { buttonClass, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList, StatCard } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fiscalYearOf } from "@/lib/finance/chart";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { formatMoney, num } from "@/lib/format";
import { param } from "@/lib/forms";
import { addDaysIso, dayFromIso, formatDmy, parseDay, todayIso } from "@/lib/ops/dates";
import { can } from "@/lib/permissions";
import { glBalances, OPENING_BATCH } from "../../_cash_fa/server";
import { Amount, Note } from "../../_cash_fa/ui";

export const metadata: Metadata = { title: "Bank Account Card" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

const LEDGER_LIMIT = 500;

export default async function BankAccountPage({ params, searchParams }: PageProps<"/finance/bank-accounts/[id]">) {
  const user = await requireUser("finance");
  await ensureFinanceSetup();
  const { id } = await params;
  const sp = await searchParams;
  const account = await db.bankAccount.findUnique({ where: { id }, include: { glAccount: { select: { id: true, code: true, name: true } } } });
  if (!account) notFound();

  const today = todayIso();
  const from = parseDay(param(sp, "from")) || fiscalYearOf(today).start;
  const to = parseDay(param(sp, "to")) || today;
  const gl = account.glAccountId;

  const [balanceNow, openingMap, entries, unmatched, unmatchedCount, lastRec] = await Promise.all([
    glBalances([gl]),
    glBalances([gl], addDaysIso(from, -1)),
    db.glEntry.findMany({
      where: { accountId: gl, postingDate: { gte: dayFromIso(from), lte: dayFromIso(to) } },
      orderBy: [{ postingDate: "asc" }, { entryNo: "asc" }],
      take: LEDGER_LIMIT + 1,
      select: { id: true, entryNo: true, transactionNo: true, postingDate: true, documentType: true, documentNo: true, description: true, debit: true, credit: true, reversed: true, contact: { select: { name: true } } },
    }),
    db.bankStatementLine.findMany({
      where: { bankAccountId: id, status: "UNMATCHED", importBatch: { not: OPENING_BATCH } },
      orderBy: { date: "asc" },
      take: 20,
    }),
    db.bankStatementLine.count({ where: { bankAccountId: id, status: "UNMATCHED", importBatch: { not: OPENING_BATCH } } }),
    db.bankReconciliation.findFirst({ where: { bankAccountId: id, status: "COMPLETED" }, orderBy: { statementDate: "desc" } }),
  ]);
  const balance = balanceNow.get(gl) ?? 0;
  const opening = openingMap.get(gl) ?? 0;
  const truncated = entries.length > LEDGER_LIMIT;
  const shown = entries.slice(0, LEDGER_LIMIT);
  const rows = shown.reduce<Array<(typeof shown)[number] & { running: number }>>((acc, e) => {
    const prev = acc.length ? acc[acc.length - 1].running : opening;
    acc.push({ ...e, running: prev + num(e.debit) - num(e.credit) });
    return acc;
  }, []);
  const closing = rows.length ? rows[rows.length - 1].running : opening;
  const totalDebit = shown.reduce((s, e) => s + num(e.debit), 0);
  const totalCredit = shown.reduce((s, e) => s + num(e.credit), 0);
  const canEdit = can(user, "finance", "edit");
  const posted = param(sp, "posted");

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {account.name} <StatusBadge status={account.isActive ? "ACTIVE" : "INACTIVE"} />
          </span>
        }
        description={`${account.code} · ledger account ${account.glAccount.code} ${account.glAccount.name}`}
        back={{ href: "/finance/bank-accounts", label: "Bank Accounts" }}
        actions={
          <>
            <ButtonLink href={`/finance/bank-reconciliation/${id}`} variant="secondary">
              Reconcile
            </ButtonLink>
            {canEdit && (
              <>
                <ButtonLink href={`/finance/bank-accounts/transfer?from=${id}`} variant="secondary">
                  Transfer
                </ButtonLink>
                <ButtonLink href={`/finance/bank-accounts/${id}/edit`} variant="secondary">
                  Edit
                </ButtonLink>
              </>
            )}
          </>
        }
      />
      {posted && (
        <div className="mb-4">
          <Note>Transfer posted as transaction {posted}.</Note>
        </div>
      )}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Balance" value={<Amount value={balance} />} hint="Ledger balance, all dates" tone={balance < 0 ? "danger" : "default"} />
        <StatCard label="Unmatched statement lines" value={unmatchedCount} tone={unmatchedCount ? "warning" : "default"} />
        <StatCard
          label="Last reconciliation"
          value={lastRec ? formatDmy(lastRec.statementDate) : "Never"}
          hint={lastRec ? `Statement balance ${formatMoney(lastRec.statementBalance)}` : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="Statement"
              description={`Ledger entries ${formatDmy(from)} – ${formatDmy(to)}`}
              actions={
                <form className="flex flex-wrap items-center gap-2">
                  <Input type="date" name="from" defaultValue={from} aria-label="From" className="w-auto" />
                  <Input type="date" name="to" defaultValue={to} aria-label="To" className="w-auto" />
                  <button type="submit" className={buttonClass("secondary", "sm")}>
                    Apply
                  </button>
                </form>
              }
            />
            <Table>
              <THead>
                <tr>
                  <TH>Posting Date</TH>
                  <TH>Document No.</TH>
                  <TH>Description</TH>
                  <TH align="right">Deposits (Dr)</TH>
                  <TH align="right">Withdrawals (Cr)</TH>
                  <TH align="right">Balance</TH>
                </tr>
              </THead>
              <TBody>
                <TR>
                  <TD className="text-ink-soft">{formatDmy(from)}</TD>
                  <TD colSpan={4} className="font-medium text-ink-soft">
                    Opening balance
                  </TD>
                  <TD align="right" className="font-medium">
                    <Amount value={opening} />
                  </TD>
                </TR>
                {rows.length === 0 && <EmptyRow colSpan={6}>No entries in this period.</EmptyRow>}
                {rows.map((e) => (
                  <TR key={e.id} className={e.reversed ? "text-ink-faint" : undefined}>
                    <TD className="whitespace-nowrap">{formatDmy(e.postingDate)}</TD>
                    <TD className="whitespace-nowrap">
                      <div className="text-xs text-ink-soft">{e.documentType}</div>
                      <div className="font-mono text-xs">{e.documentNo ?? `Tx ${e.transactionNo}`}</div>
                    </TD>
                    <TD>
                      {e.description}
                      {e.contact && <div className="text-xs text-ink-faint">{e.contact.name}</div>}
                      {e.reversed && <div className="text-xs text-ink-faint">Reversed</div>}
                    </TD>
                    <TD align="right">{num(e.debit) ? formatMoney(e.debit) : ""}</TD>
                    <TD align="right">{num(e.credit) ? formatMoney(e.credit) : ""}</TD>
                    <TD align="right">
                      <Amount value={e.running} />
                    </TD>
                  </TR>
                ))}
                {rows.length > 0 && (
                  <TR className="font-medium">
                    <TD colSpan={3}>Totals and closing balance</TD>
                    <TD align="right">{formatMoney(totalDebit)}</TD>
                    <TD align="right">{formatMoney(totalCredit)}</TD>
                    <TD align="right">
                      <Amount value={closing} />
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
            {truncated && <p className="border-t border-line px-4 py-2 text-xs text-ink-faint">Showing the first {LEDGER_LIMIT} entries; narrow the dates to see the rest.</p>}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DetailList
                items={[
                  { label: "Type", value: account.kind === "CASH" ? "Cash" : "Bank" },
                  { label: "Bank", value: account.bankName },
                  { label: "Account No.", value: account.accountNo },
                  { label: "IFSC", value: account.ifsc },
                  { label: "Branch", value: account.branchName },
                  { label: "Currency", value: account.currency },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title="Unreconciled statement lines"
              actions={
                <Link href={`/finance/bank-reconciliation/${id}`} className="text-xs font-medium text-brand-700 hover:underline">
                  Open reconciliation
                </Link>
              }
            />
            <Table>
              <TBody>
                {unmatched.length === 0 && <EmptyRow colSpan={3}>All imported lines are matched.</EmptyRow>}
                {unmatched.map((l) => (
                  <TR key={l.id}>
                    <TD className="whitespace-nowrap text-ink-soft">{formatDmy(l.date)}</TD>
                    <TD className="text-xs">{l.description}</TD>
                    <TD align="right">
                      <Amount value={num(l.amount)} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {unmatchedCount > unmatched.length && <p className="border-t border-line px-4 py-2 text-xs text-ink-faint">and {unmatchedCount - unmatched.length} more</p>}
          </Card>
          {lastRec && (
            <Card>
              <CardHeader title="Last reconciliation" />
              <CardBody>
                <DetailList
                  items={[
                    { label: "Statement date", value: formatDmy(lastRec.statementDate) },
                    { label: "Statement balance", value: formatMoney(lastRec.statementBalance) },
                    { label: "Book balance", value: formatMoney(lastRec.bookBalance) },
                    { label: "Completed", value: lastRec.completedAt ? formatDmy(lastRec.completedAt) : "—" },
                  ]}
                />
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
