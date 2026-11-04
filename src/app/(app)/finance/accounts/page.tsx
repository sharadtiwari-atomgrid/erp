import { Fragment } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { param } from "@/lib/forms";
import { formatDmy, todayIso } from "@/lib/ops/dates";
import { can } from "@/lib/permissions";
import { loadAccountTree } from "../_gl/accounts";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS, typeTotals } from "../_gl/ledger";
import { isoParam } from "../_gl/server";
import { Amount, FilterField } from "../_gl/ui";

export const metadata: Metadata = { title: "Chart of accounts" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinanceAccountsPage({ searchParams }: PageProps<"/finance/accounts">) {
  const user = await requireUser("finance", "view");
  await ensureFinanceSetup();
  const sp = await searchParams;
  const asOf = isoParam(param(sp, "asOf"), todayIso());
  const type = param(sp, "type");
  const q = param(sp, "q");
  const showBlocked = param(sp, "blocked") === "1";
  const rows = await loadAccountTree({ asOf, type, q, showBlocked });
  const totals = typeTotals(rows);
  const exportQs = new URLSearchParams({ asOf, type, q, ...(showBlocked ? { blocked: "1" } : {}) }).toString();

  return (
    <>
      <PageHeader
        title="Chart of accounts"
        description={`Ledger accounts by Schedule III heading, with balances as on ${formatDmy(asOf)}.`}
        actions={
          <>
            <a href={`/finance/accounts/export?${exportQs}`} className={buttonClass("secondary")}>
              Export to Excel
            </a>
            {can(user, "finance", "edit") && <ButtonLink href="/finance/accounts/new">New account</ButtonLink>}
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {ACCOUNT_TYPES.map((t) => (
          <div key={t} className="rounded-lg border border-line bg-surface px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{ACCOUNT_TYPE_LABELS[t]}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-ink">
              <Amount value={totals[t]} />
            </p>
          </div>
        ))}
      </div>
      <Card>
        <form className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-3" role="search">
          <FilterField label="Search">
            <Input name="q" defaultValue={q} placeholder="Code, name or category" className="w-56" />
          </FilterField>
          <FilterField label="Type">
            <Select name="type" defaultValue={type} className="w-40">
              <option value="">All types</option>
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ACCOUNT_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Balance as on">
            <Input type="date" name="asOf" defaultValue={asOf} className="w-40" />
          </FilterField>
          <label className="flex h-9 items-center gap-2 text-sm text-ink">
            <input type="checkbox" name="blocked" value="1" defaultChecked={showBlocked} className="h-4 w-4 rounded border-line" />
            Show blocked
          </label>
          <button type="submit" className={buttonClass("secondary")}>
            Apply
          </button>
        </form>
        <Table>
          <THead>
            <tr>
              <TH>Code</TH>
              <TH>Name</TH>
              <TH>Category</TH>
              <TH align="right">Balance</TH>
            </tr>
          </THead>
          <TBody>
            {rows.length === 0 && <EmptyRow colSpan={4} />}
            {rows.map((r, i) => {
              const newType = i === 0 || rows[i - 1].type !== r.type;
              return (
                <Fragment key={r.id}>
                {newType && r.depth === 0 && (
                  <tr className="bg-muted/40">
                    <td colSpan={4} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                      {ACCOUNT_TYPE_LABELS[r.type]}
                    </td>
                  </tr>
                )}
                <TR className={cn(!r.isActive && "opacity-60")}>
                  <TD className={cn("whitespace-nowrap tabular-nums", r.isGroup && "font-semibold")}>{r.code}</TD>
                  <TD>
                    <span style={{ paddingLeft: `${r.depth * 1.25}rem` }} className="inline-flex items-center gap-2">
                      <Link href={`/finance/accounts/${r.id}`} className={cn("hover:underline", r.isGroup ? "font-semibold text-ink" : "text-brand-700")}>
                        {r.name}
                      </Link>
                      {!r.isActive && <Badge tone="red">Blocked</Badge>}
                      {!r.isGroup && !r.directPosting && <Badge tone="violet">Control</Badge>}
                    </span>
                  </TD>
                  <TD className="text-ink-soft">{r.category}</TD>
                  <TD align="right" className={cn(r.isGroup && "font-semibold")}>
                    <Amount value={r.balance} blankZero />
                  </TD>
                </TR>
                </Fragment>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
