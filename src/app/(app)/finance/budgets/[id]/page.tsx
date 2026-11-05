import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader, StatCard } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { num } from "@/lib/format";
import { param } from "@/lib/forms";
import { isoFromDay, todayIso } from "@/lib/ops/dates";
import { can } from "@/lib/permissions";
import { budgetVsActual, fiscalMonths, monthLabel, monthsInView, netOf } from "../../_gl/ledger";
import { Amount, FilterField, dimensionText } from "../../_gl/ui";
import { copyFromLastYear, deleteBudget, saveBudgetLines } from "../actions";
import { BudgetGrid } from "../budget-forms";
import { actualsByMonth, budgetAccounts, budgetDims } from "../data";

export const metadata: Metadata = { title: "G/L Budget" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function BudgetPage({ params, searchParams }: PageProps<"/finance/budgets/[id]">) {
  const user = await requireUser("finance", "view");
  await ensureFinanceSetup();
  const { id } = await params;
  const sp = await searchParams;
  const budget = await db.budget.findUnique({ where: { id }, include: { fiscalYear: true, lines: true } });
  if (!budget) notFound();
  const canEdit = can(user, "finance", "edit");
  const view = param(sp, "view") === "bva" ? "bva" : "grid";
  const startYear = Number(isoFromDay(budget.fiscalYear.startDate).slice(0, 4));
  const months = fiscalMonths(startYear);
  const accounts = await budgetAccounts(id);

  const initial: Record<string, Record<string, number>> = {};
  for (const l of budget.lines) {
    (initial[l.accountId] ??= {})[isoFromDay(l.month)] = num(l.amount);
  }
  const dims = budgetDims(budget.dimensions);

  const tab = (v: string, label: string) => (
    <Link
      href={`/finance/budgets/${id}${v === "bva" ? "?view=bva" : ""}`}
      className={cn("border-b-2 px-3 py-2 text-sm font-medium", view === v ? "border-brand-600 text-brand-700" : "border-transparent text-ink-soft hover:text-ink")}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader
        title={budget.name}
        description={`${budget.fiscalYear.name} · ${dimensionText(budget.dimensions) || "Whole company"}${budget.notes ? ` · ${budget.notes}` : ""}`}
        back={{ href: "/finance/budgets", label: "G/L Budgets" }}
        actions={
          canEdit && (
            <>
              <ActionButton action={deleteBudget.bind(null, id)} variant="ghost" confirmMessage="Delete this budget?">
                Delete
              </ActionButton>
              <ActionButton
                action={copyFromLastYear.bind(null, id)}
                confirmMessage="Replace every amount in this budget with last year's actuals?"
                pendingText="Copying…"
                fields={
                  <label className="flex items-center gap-1 text-xs text-ink-soft">
                    Uplift %
                    <Input name="uplift" type="number" step="0.1" defaultValue="0" className="w-20" />
                  </label>
                }
              >
                Copy last year’s actuals
              </ActionButton>
            </>
          )
        }
      />
      <div className="mb-4 flex gap-1 border-b border-line">
        {tab("grid", "Budget")}
        {tab("bva", "Budget vs actual")}
      </div>
      {view === "grid" ? (
        <BudgetGrid action={saveBudgetLines.bind(null, id)} accounts={accounts} months={months} initial={initial} readOnly={!canEdit} />
      ) : (
        <BudgetVsActual
          months={months}
          accounts={accounts}
          initial={initial}
          dims={dims}
          month={param(sp, "month")}
          mode={param(sp, "mode") === "month" ? "month" : "ytd"}
        />
      )}
    </>
  );
}

async function BudgetVsActual({
  months,
  accounts,
  initial,
  dims,
  month: monthParam,
  mode,
}: {
  months: string[];
  accounts: Awaited<ReturnType<typeof budgetAccounts>>;
  initial: Record<string, Record<string, number>>;
  dims: Record<string, string>;
  month: string;
  mode: "month" | "ytd";
}) {
  const thisMonth = `${todayIso().slice(0, 7)}-01`;
  const month = months.includes(monthParam) ? monthParam : months.includes(thisMonth) ? thisMonth : months[11];
  const inView = monthsInView(months, month, mode);
  const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const actuals = await actualsByMonth(inView[0], lastDay, dims);

  const rows = budgetVsActual(
    accounts.map((a) => {
      let debit = 0;
      let credit = 0;
      for (const m of inView) {
        const t = actuals.get(a.id)?.get(m);
        if (t) {
          debit += t.debit;
          credit += t.credit;
        }
      }
      return { accountId: a.id, type: a.type, budget: inView.reduce((s, m) => s + (initial[a.id]?.[m] ?? 0), 0), debit, credit };
    }),
  ).filter((r) => r.budget !== 0 || r.actual !== 0);
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const net = netOf(rows);
  const groups = (["INCOME", "EXPENSE"] as const).map((t) => ({ type: t, rows: rows.filter((r) => r.type === t) }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Budgeted net profit" value={<Amount value={net.budget} />} />
        <StatCard label="Actual net profit" value={<Amount value={net.actual} />} />
        <StatCard label="Variance" value={<Amount value={net.variance} />} tone={net.variance < 0 ? "danger" : "default"} hint={net.variance >= 0 ? "Favourable" : "Adverse"} />
      </div>
      <Card>
        <CardHeader title={`Budget vs actual · ${mode === "ytd" ? `April to ${monthLabel(month)}` : monthLabel(month)}`} />
        <form className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-3">
          <input type="hidden" name="view" value="bva" />
          <FilterField label="Month">
            <Select name="month" defaultValue={month} className="w-36">
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Show">
            <Select name="mode" defaultValue={mode} className="w-36">
              <option value="ytd">Year to date</option>
              <option value="month">Month only</option>
            </Select>
          </FilterField>
          <button type="submit" className={buttonClass("secondary")}>
            Apply
          </button>
        </form>
        <Table>
          <THead>
            <tr>
              <TH>Account</TH>
              <TH align="right">Budget</TH>
              <TH align="right">Actual</TH>
              <TH align="right">Variance</TH>
              <TH align="right">%</TH>
            </tr>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={5}>No budget or actuals for this period.</EmptyRow>}
            {groups.map((g) =>
              g.rows.length === 0 ? null : (
                <GroupRows key={g.type} title={g.type === "INCOME" ? "Income" : "Expenses"} rows={g.rows} name={(rid) => byId.get(rid)} />
              ),
            )}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}

function GroupRows({
  title,
  rows,
  name,
}: {
  title: string;
  rows: ReturnType<typeof budgetVsActual>;
  name: (id: string) => { code: string; name: string } | undefined;
}) {
  const budget = rows.reduce((s, r) => s + r.budget, 0);
  const actual = rows.reduce((s, r) => s + r.actual, 0);
  return (
    <>
      <tr className="bg-muted/30">
        <td colSpan={5} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
          {title}
        </td>
      </tr>
      {rows.map((r) => {
        const a = name(r.accountId);
        return (
          <TR key={r.accountId}>
            <TD>
              <Link href={`/finance/accounts/${r.accountId}`} className="hover:underline">
                <span className="tabular-nums text-ink-soft">{a?.code}</span> {a?.name}
              </Link>
            </TD>
            <TD align="right">
              <Amount value={r.budget} blankZero />
            </TD>
            <TD align="right">
              <Amount value={r.actual} blankZero />
            </TD>
            <TD align="right" className={r.favourable ? "text-emerald-600" : "text-red-600"}>
              {r.variance > 0 ? "+" : ""}
              {r.variance.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </TD>
            <TD align="right" className={cn("text-xs", r.favourable ? "text-emerald-600" : "text-red-600")}>
              {r.variancePct === null ? "—" : `${r.variancePct > 0 ? "+" : ""}${r.variancePct}%`}
            </TD>
          </TR>
        );
      })}
      <tr className="bg-muted/40 font-semibold">
        <TD>Total {title.toLowerCase()}</TD>
        <TD align="right">
          <Amount value={budget} />
        </TD>
        <TD align="right">
          <Amount value={actual} />
        </TD>
        <TD align="right">{(actual - budget).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TD>
        <TD />
      </tr>
    </>
  );
}
