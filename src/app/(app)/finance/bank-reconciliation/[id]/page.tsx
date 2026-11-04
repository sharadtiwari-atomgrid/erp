import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { buttonClass, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, StatCard } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { getPostingAccountOptions } from "@/lib/finance/queries";
import { formatMoney, num } from "@/lib/format";
import { param } from "@/lib/forms";
import { addDaysIso, formatDmy, isoFromDay, parseDay, todayIso } from "@/lib/ops/dates";
import { can } from "@/lib/permissions";
import { glBalances, OPENING_BATCH, reconciliationFigures, unclearedEntries } from "../../_cash_fa/server";
import { Amount, Note } from "../../_cash_fa/ui";
import { autoMatchLines, clearOpeningEntries, completeReconciliation, restoreLine, undoOpeningClear, unmatchLine } from "../actions";
import { ReconcileWorkspace } from "./reconcile-workspace";

export const metadata: Metadata = { title: "Reconcile bank account" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function ReconcilePage({ params, searchParams }: PageProps<"/finance/bank-reconciliation/[id]">) {
  const user = await requireUser("finance");
  await ensureFinanceSetup();
  const { id } = await params;
  const sp = await searchParams;
  const bank = await db.bankAccount.findUnique({ where: { id }, include: { glAccount: { select: { code: true, name: true } } } });
  if (!bank) notFound();
  const canEdit = can(user, "finance", "edit");

  const [unmatched, matched, ignored, openingClears, uncleared, accounts, postingKeys, history, firstLine, lastLine, balances] = await Promise.all([
    db.bankStatementLine.findMany({ where: { bankAccountId: id, status: "UNMATCHED" }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
    db.bankStatementLine.findMany({ where: { bankAccountId: id, status: "MATCHED", reconciledAt: null, importBatch: { not: OPENING_BATCH } }, orderBy: { date: "asc" } }),
    db.bankStatementLine.findMany({ where: { bankAccountId: id, status: "IGNORED", reconciledAt: null }, orderBy: { date: "asc" } }),
    db.bankStatementLine.findMany({ where: { bankAccountId: id, importBatch: OPENING_BATCH }, orderBy: { date: "asc" } }),
    unclearedEntries(id, bank.glAccountId),
    getPostingAccountOptions({ journalOnly: true }),
    db.postingAccount.findMany({ where: { key: { in: ["BANK_CHARGES"] } } }),
    db.bankReconciliation.findMany({ where: { bankAccountId: id }, orderBy: { statementDate: "desc" }, take: 24 }),
    db.bankStatementLine.findFirst({ where: { bankAccountId: id, importBatch: { not: OPENING_BATCH } }, orderBy: { date: "asc" }, select: { date: true } }),
    db.bankStatementLine.findFirst({ where: { bankAccountId: id, importBatch: { not: OPENING_BATCH } }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], select: { date: true, balance: true } }),
    glBalances([bank.glAccountId]),
  ]);
  const interest = accounts.find((a) => a.code === "4210");

  // Completion figures for the chosen statement date and closing balance.
  const statementDate = parseDay(param(sp, "date")) || (lastLine ? isoFromDay(lastLine.date) : todayIso());
  const balanceParam = param(sp, "balance");
  const lastAtDate = await db.bankStatementLine.findFirst({
    where: { bankAccountId: id, importBatch: { not: OPENING_BATCH }, balance: { not: null }, date: { lte: new Date(`${statementDate}T00:00:00Z`) } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: { balance: true },
  });
  const statementBalance = balanceParam !== "" && Number.isFinite(Number(balanceParam)) ? Number(balanceParam) : lastAtDate?.balance != null ? num(lastAtDate.balance) : null;
  const figures = statementBalance !== null ? await reconciliationFigures(id, bank.glAccountId, statementDate, statementBalance) : null;

  const firstStatementDay = firstLine ? isoFromDay(firstLine.date) : null;
  const beforeFirst = firstStatementDay ? uncleared.filter((e) => isoFromDay(e.postingDate) < firstStatementDay) : [];

  return (
    <>
      <PageHeader
        title={`Reconcile ${bank.name}`}
        description={`${bank.code} · ledger account ${bank.glAccount.code} ${bank.glAccount.name}`}
        back={{ href: "/finance/bank-reconciliation", label: "Bank reconciliation" }}
        actions={
          <>
            <ButtonLink href={`/finance/bank-reconciliation?bank=${id}`} variant="secondary">
              Import statement
            </ButtonLink>
            <ButtonLink href={`/finance/bank-accounts/${id}`} variant="secondary">
              Bank account
            </ButtonLink>
            {canEdit && (
              <ActionButton action={autoMatchLines.bind(null, id)} variant="primary" pendingText="Matching…" disabled={unmatched.length === 0}>
                Auto-match
              </ActionButton>
            )}
          </>
        }
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Book balance" value={<Amount value={balances.get(bank.glAccountId) ?? 0} />} hint="All dates" />
        <StatCard label="Unmatched lines" value={unmatched.length} tone={unmatched.length ? "warning" : "default"} />
        <StatCard label="Uncleared entries" value={uncleared.length} />
        <StatCard label="Last statement line" value={lastLine ? formatDmy(lastLine.date) : "None"} hint={lastLine?.balance != null ? `Balance ${formatMoney(lastLine.balance)}` : undefined} />
      </div>

      <ReconcileWorkspace
        bankAccountId={id}
        canEdit={canEdit}
        lines={unmatched.map((l) => ({ id: l.id, date: isoFromDay(l.date), description: l.description, reference: l.reference, amount: num(l.amount) }))}
        entries={uncleared.map((e) => ({
          id: e.id,
          date: isoFromDay(e.postingDate),
          documentType: e.documentType,
          documentNo: e.documentNo,
          description: e.description,
          contactName: e.contact?.name ?? null,
          debit: num(e.debit),
          credit: num(e.credit),
        }))}
        accounts={accounts.filter((a) => a.id !== bank.glAccountId).map((a) => ({ id: a.id, code: a.code, name: a.name }))}
        chargesAccountId={postingKeys.find((p) => p.key === "BANK_CHARGES")?.accountId}
        incomeAccountId={interest?.id}
      />

      {canEdit && beforeFirst.length > 0 && firstStatementDay && (
        <div className="mt-6">
          <Card>
            <CardHeader
              title="Entries from before the first statement"
              description={`${beforeFirst.length} uncleared ledger entr${beforeFirst.length === 1 ? "y is" : "ies are"} dated before the first imported statement line (${formatDmy(firstStatementDay)}). If they are already in the bank's opening balance, clear them as opening.`}
            />
            <CardBody>
              <ActionButton
                action={clearOpeningEntries.bind(null, id)}
                confirmMessage="Mark every uncleared entry up to this date as cleared?"
                fields={<Input type="date" name="upTo" defaultValue={addDaysIso(firstStatementDay, -1)} aria-label="Clear up to" className="w-auto" />}
              >
                Clear as opening
              </ActionButton>
            </CardBody>
          </Card>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Complete reconciliation" description="Enter the date and closing balance printed on the bank statement." />
          <CardBody className="space-y-4">
            <form className="flex flex-wrap items-end gap-2">
              <label className="text-sm text-ink">
                <span className="mb-1 block text-xs text-ink-soft">Statement date</span>
                <Input type="date" name="date" defaultValue={statementDate} className="w-auto" />
              </label>
              <label className="text-sm text-ink">
                <span className="mb-1 block text-xs text-ink-soft">Statement closing balance</span>
                <Input type="number" step="0.01" name="balance" defaultValue={statementBalance ?? ""} className="w-44 text-right tabular-nums" required />
              </label>
              <button type="submit" className={buttonClass("secondary")}>
                Calculate
              </button>
            </form>
            {figures ? (
              <>
                <Table>
                  <TBody>
                    <TR>
                      <TD>Book balance at {formatDmy(statementDate)}</TD>
                      <TD align="right">
                        <Amount value={figures.summary.bookBalance} />
                      </TD>
                    </TR>
                    <TR>
                      <TD>Less: deposits in the books not yet on the statement</TD>
                      <TD align="right">
                        <Amount value={-figures.summary.unclearedDeposits} />
                      </TD>
                    </TR>
                    <TR>
                      <TD>Add: payments in the books not yet on the statement</TD>
                      <TD align="right">
                        <Amount value={figures.summary.unclearedPayments} />
                      </TD>
                    </TR>
                    <TR className="font-medium">
                      <TD>Expected statement balance</TD>
                      <TD align="right">
                        <Amount value={figures.summary.expectedStatementBalance} />
                      </TD>
                    </TR>
                    <TR>
                      <TD>Statement closing balance</TD>
                      <TD align="right">
                        <Amount value={figures.summary.statementBalance} />
                      </TD>
                    </TR>
                    <TR className="font-semibold">
                      <TD>Difference</TD>
                      <TD align="right" className={figures.summary.difference === 0 ? "text-emerald-700" : "text-red-600"}>
                        {formatMoney(figures.summary.difference)}
                      </TD>
                    </TR>
                  </TBody>
                </Table>
                {figures.unmatchedLines > 0 && (
                  <Note tone="warning">
                    {figures.unmatchedLines} statement line{figures.unmatchedLines === 1 ? " is" : "s are"} unmatched up to {formatDmy(statementDate)}. Match them, create entries for them, or ignore them.
                  </Note>
                )}
                {canEdit && (
                  <div className="flex justify-end">
                    <ActionButton
                      action={completeReconciliation.bind(null, id)}
                      variant="primary"
                      disabled={figures.summary.difference !== 0 || figures.unmatchedLines > 0}
                      pendingText="Completing…"
                      fields={
                        <>
                          <input type="hidden" name="statementDate" value={statementDate} />
                          <input type="hidden" name="statementBalance" value={String(figures.summary.statementBalance)} />
                          <Input name="notes" placeholder="Notes (optional)" aria-label="Notes" className="w-56" />
                        </>
                      }
                    >
                      Complete reconciliation
                    </ActionButton>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-ink-soft">Enter the statement closing balance and press Calculate.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="History" />
          <Table>
            <THead>
              <tr>
                <TH>Statement date</TH>
                <TH align="right">Statement balance</TH>
                <TH align="right">Book balance</TH>
                <TH>Completed</TH>
                <TH>Notes</TH>
              </tr>
            </THead>
            <TBody>
              {history.length === 0 && <EmptyRow colSpan={5}>Not reconciled yet.</EmptyRow>}
              {history.map((r) => (
                <TR key={r.id}>
                  <TD>{formatDmy(r.statementDate)}</TD>
                  <TD align="right">{formatMoney(r.statementBalance)}</TD>
                  <TD align="right">{formatMoney(r.bookBalance)}</TD>
                  <TD className="text-ink-soft">{r.completedAt ? formatDmy(r.completedAt) : r.status}</TD>
                  <TD className="text-xs text-ink-soft">{r.notes}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={`Matched, not yet reconciled (${matched.length})`} />
          <Table>
            <TBody>
              {matched.length === 0 && <EmptyRow colSpan={4}>None.</EmptyRow>}
              {matched.map((l) => (
                <TR key={l.id}>
                  <TD className="whitespace-nowrap">{formatDmy(l.date)}</TD>
                  <TD className="text-xs">
                    {l.description}
                    <div className="text-ink-faint">
                      {l.matchedEntryIds.length} entr{l.matchedEntryIds.length === 1 ? "y" : "ies"}
                    </div>
                  </TD>
                  <TD align="right">
                    <Amount value={num(l.amount)} />
                  </TD>
                  <TD align="right">
                    {canEdit && (
                      <ActionButton action={unmatchLine.bind(null, l.id)} size="sm" variant="ghost">
                        Unmatch
                      </ActionButton>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
        <Card>
          <CardHeader title={`Ignored lines (${ignored.length})`} description="Left out of matching, e.g. duplicates in the statement." />
          <Table>
            <TBody>
              {ignored.length === 0 && <EmptyRow colSpan={4}>None.</EmptyRow>}
              {ignored.map((l) => (
                <TR key={l.id}>
                  <TD className="whitespace-nowrap">{formatDmy(l.date)}</TD>
                  <TD className="text-xs">{l.description}</TD>
                  <TD align="right">
                    <Amount value={num(l.amount)} />
                  </TD>
                  <TD align="right">
                    {canEdit && (
                      <ActionButton action={restoreLine.bind(null, l.id)} size="sm" variant="ghost">
                        Restore
                      </ActionButton>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {openingClears.length > 0 && (
            <div className="border-t border-line">
              <p className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-ink-faint">Cleared as opening</p>
              <Table>
                <TBody>
                  {openingClears.map((l) => (
                    <TR key={l.id}>
                      <TD className="text-xs">{l.description}</TD>
                      <TD align="right">
                        <Amount value={num(l.amount)} />
                      </TD>
                      <TD align="right">
                        {canEdit && !l.reconciledAt && (
                          <ActionButton action={undoOpeningClear.bind(null, l.id)} size="sm" variant="ghost">
                            Undo
                          </ActionButton>
                        )}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
