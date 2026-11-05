import Link from "next/link";
import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { formatDateTime, num } from "@/lib/format";
import { can } from "@/lib/permissions";
import { getDimensionOptions } from "../_gl/server";
import { Amount, dimensionText } from "../_gl/ui";
import { createBudget } from "./actions";
import { NewBudgetForm } from "./budget-forms";

export const metadata: Metadata = { title: "G/L Budgets" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinanceBudgetsPage() {
  const user = await requireUser("finance", "view");
  await ensureFinanceSetup();
  const [budgets, years, dimensions] = await Promise.all([
    db.budget.findMany({
      orderBy: [{ fiscalYear: { startDate: "desc" } }, { name: "asc" }],
      include: { fiscalYear: { select: { name: true } }, lines: { select: { amount: true, account: { select: { type: true } } } } },
    }),
    db.fiscalYear.findMany({ orderBy: { startDate: "desc" }, select: { id: true, name: true } }),
    getDimensionOptions(),
  ]);

  return (
    <>
      <PageHeader title="G/L Budgets" description="Monthly income and expense budgets by account, compared with actuals from the ledger." />
      <div className="space-y-6">
        <Card>
          <Table>
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Financial year</TH>
                <TH>Dimension filter</TH>
                <TH align="right">Income</TH>
                <TH align="right">Expenses</TH>
                <TH align="right">Net</TH>
                <TH>Updated</TH>
              </tr>
            </THead>
            <TBody>
              {budgets.length === 0 && <EmptyRow colSpan={7}>No budgets yet.</EmptyRow>}
              {budgets.map((b) => {
                const income = b.lines.filter((l) => l.account.type === "INCOME").reduce((s, l) => s + num(l.amount), 0);
                const expense = b.lines.filter((l) => l.account.type === "EXPENSE").reduce((s, l) => s + num(l.amount), 0);
                return (
                  <TR key={b.id}>
                    <TD>
                      <Link href={`/finance/budgets/${b.id}`} className="font-medium text-brand-700 hover:underline">
                        {b.name}
                      </Link>
                    </TD>
                    <TD>{b.fiscalYear.name}</TD>
                    <TD className="text-ink-soft">{dimensionText(b.dimensions) || "Whole company"}</TD>
                    <TD align="right">
                      <Amount value={income} />
                    </TD>
                    <TD align="right">
                      <Amount value={expense} />
                    </TD>
                    <TD align="right">
                      <Amount value={income - expense} />
                    </TD>
                    <TD className="text-ink-soft">{formatDateTime(b.updatedAt)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
        {can(user, "finance", "edit") && <NewBudgetForm action={createBudget} years={years} dimensions={dimensions} />}
      </div>
    </>
  );
}
