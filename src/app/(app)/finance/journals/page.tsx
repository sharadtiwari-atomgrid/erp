import Link from "next/link";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/form";
import { Pagination } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { Prisma } from "@/generated/prisma/client";
import { JournalStatus } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { formatMoney, humanize, num } from "@/lib/format";
import { pagination, param } from "@/lib/forms";
import { formatDmy } from "@/lib/ops/dates";
import { can } from "@/lib/permissions";
import { JOURNAL_KINDS, JOURNAL_STATUS_TONE } from "../_gl/ledger";
import { FilterField } from "../_gl/ui";

export const metadata: Metadata = { title: "General Journals" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinanceJournalsPage({ searchParams }: PageProps<"/finance/journals">) {
  const user = await requireUser("finance", "view");
  await ensureFinanceSetup();
  const sp = await searchParams;
  const q = param(sp, "q");
  const status = param(sp, "status");
  const kind = param(sp, "kind");
  const { page, take, skip } = pagination(sp);

  const where: Prisma.JournalWhereInput = {
    ...(Object.values(JournalStatus).includes(status as JournalStatus) ? { status: status as JournalStatus } : {}),
    ...((JOURNAL_KINDS as readonly string[]).includes(kind) ? { kind } : {}),
    ...(q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { narration: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [journals, total] = await Promise.all([
    db.journal.findMany({ where, orderBy: [{ date: "desc" }, { number: "desc" }], take, skip, include: { lines: { select: { debit: true } } } }),
    db.journal.count({ where }),
  ]);
  const canEdit = can(user, "finance", "edit");

  return (
    <>
      <PageHeader
        title="General Journals"
        description="Manual journal vouchers: adjustments, contras and opening balances."
        actions={
          canEdit && (
            <>
              <ButtonLink href="/finance/journals/new?kind=Opening%20balance" variant="secondary">
                Opening Balances
              </ButtonLink>
              <ButtonLink href="/finance/journals/new">New General Journal</ButtonLink>
            </>
          )
        }
      />
      <Card>
        <form className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-3" role="search">
          <FilterField label="Search">
            <Input name="q" defaultValue={q} placeholder="Number or narration" className="w-56" />
          </FilterField>
          <FilterField label="Status">
            <Select name="status" defaultValue={status} className="w-36">
              <option value="">All statuses</option>
              {Object.values(JournalStatus).map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Kind">
            <Select name="kind" defaultValue={kind} className="w-40">
              <option value="">All kinds</option>
              {JOURNAL_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </Select>
          </FilterField>
          <button type="submit" className={buttonClass("secondary")}>
            Apply
          </button>
        </form>
        <Table>
          <THead>
            <tr>
              <TH>Number</TH>
              <TH>Posting Date</TH>
              <TH>Kind</TH>
              <TH>Description</TH>
              <TH>Status</TH>
              <TH align="right">Transaction</TH>
              <TH align="right">Amount</TH>
            </tr>
          </THead>
          <TBody>
            {journals.length === 0 && <EmptyRow colSpan={7}>No journals yet.</EmptyRow>}
            {journals.map((j) => (
              <TR key={j.id}>
                <TD>
                  <Link href={`/finance/journals/${j.id}`} className="font-medium text-brand-700 hover:underline">
                    {j.number}
                  </Link>
                </TD>
                <TD className="whitespace-nowrap text-ink-soft">{formatDmy(j.date)}</TD>
                <TD>{j.kind}</TD>
                <TD className="max-w-xs truncate text-ink-soft">{j.narration ?? "—"}</TD>
                <TD>
                  <Badge tone={JOURNAL_STATUS_TONE[j.status]}>{humanize(j.status)}</Badge>
                </TD>
                <TD align="right">
                  {j.transactionNo ? (
                    <Link href={`/finance/entries?transactionNo=${j.transactionNo}`} className="text-brand-700 hover:underline">
                      {j.transactionNo}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TD>
                <TD align="right">{formatMoney(j.lines.reduce((s, l) => s + num(l.debit), 0))}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <Pagination page={page} pageSize={take} total={total} searchParams={sp} />
      </Card>
    </>
  );
}
