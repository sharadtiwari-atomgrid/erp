import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList, StatCard } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isDebitNormal, fiscalYearOf, normalBalance } from "@/lib/finance/chart";
import { glEntryWhere } from "@/lib/finance/queries";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { num } from "@/lib/format";
import { param } from "@/lib/forms";
import { addDaysIso, formatDmy, todayIso } from "@/lib/ops/dates";
import { can } from "@/lib/permissions";
import { ACCOUNT_TYPE_LABELS, sourceHref, withRunningBalance } from "../../_gl/ledger";
import { isoParam, paymentInvoiceMap } from "../../_gl/server";
import { Amount, FilterField } from "../../_gl/ui";
import { deleteAccount, setAccountBlocked } from "../actions";

export const metadata: Metadata = { title: "Account ledger" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

const LIMIT = 2000;

export default async function AccountPage({ params, searchParams }: PageProps<"/finance/accounts/[id]">) {
  const user = await requireUser("finance", "view");
  await ensureFinanceSetup();
  const { id } = await params;
  const sp = await searchParams;
  const today = todayIso();
  const from = isoParam(param(sp, "from"), fiscalYearOf(today).start);
  const to = isoParam(param(sp, "to"), today);

  const account = await db.glAccount.findUnique({
    where: { id },
    include: {
      parent: { select: { id: true, code: true, name: true } },
      children: { orderBy: { code: "asc" }, select: { id: true, code: true, name: true } },
      postingAccounts: { select: { key: true } },
      _count: { select: { entries: true } },
    },
  });
  if (!account) notFound();

  // A heading's ledger shows every account beneath it.
  const ids = [account.id];
  if (account.isGroup) {
    let frontier = [account.id];
    while (frontier.length) {
      const kids = await db.glAccount.findMany({ where: { parentId: { in: frontier } }, select: { id: true } });
      frontier = kids.map((k) => k.id).filter((k) => !ids.includes(k));
      ids.push(...frontier);
    }
  }

  const [before, entries, inRange] = await Promise.all([
    db.glEntry.aggregate({ where: { accountId: { in: ids }, ...glEntryWhere({ to: addDaysIso(from, -1) }) }, _sum: { debit: true, credit: true } }),
    db.glEntry.findMany({
      where: { accountId: { in: ids }, ...glEntryWhere({ from, to }) },
      orderBy: [{ postingDate: "asc" }, { entryNo: "asc" }],
      take: LIMIT,
      include: { contact: { select: { id: true, name: true } }, account: { select: { code: true } } },
    }),
    db.glEntry.aggregate({ where: { accountId: { in: ids }, ...glEntryWhere({ from, to }) }, _sum: { debit: true, credit: true }, _count: true }),
  ]);
  const opening = normalBalance(account.type, num(before._sum.debit), num(before._sum.credit));
  const rows = withRunningBalance(
    entries.map((e) => ({ ...e, debit: num(e.debit), credit: num(e.credit) })),
    account.type,
    opening,
  );
  const periodDebit = num(inRange._sum.debit);
  const periodCredit = num(inRange._sum.credit);
  const closing = opening + normalBalance(account.type, periodDebit, periodCredit);
  const payments = await paymentInvoiceMap(entries.filter((e) => e.sourceType === "Payment" && e.sourceId).map((e) => e.sourceId!));
  const canEdit = can(user, "finance", "edit");
  const direction = isDebitNormal(account.type) ? "debit" : "credit";

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {account.code} {account.name}
            {!account.isActive && <Badge tone="red">Blocked</Badge>}
            {account.isGroup && <Badge tone="blue">Heading</Badge>}
            {account.isSystem && <Badge>System</Badge>}
          </span>
        }
        description={`${ACCOUNT_TYPE_LABELS[account.type]} · ${account.category}`}
        back={{ href: "/finance/accounts", label: "Chart of accounts" }}
        actions={
          canEdit && (
            <>
              {!account.isSystem && account._count.entries === 0 && account.children.length === 0 && (
                <ActionButton action={deleteAccount.bind(null, id)} variant="ghost" confirmMessage="Delete this account?">
                  Delete
                </ActionButton>
              )}
              <ActionButton
                action={setAccountBlocked.bind(null, id, account.isActive)}
                variant="secondary"
                confirmMessage={account.isActive ? "Block this account? Nothing can be posted to it while blocked." : undefined}
              >
                {account.isActive ? "Block" : "Unblock"}
              </ActionButton>
              <ButtonLink href={`/finance/accounts/${id}/edit`} variant="secondary">
                Edit
              </ButtonLink>
              {account.directPosting && account.isActive && <ButtonLink href="/finance/journals/new">New journal</ButtonLink>}
            </>
          )
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={`Opening ${formatDmy(from)}`} value={<Amount value={opening} />} hint={`Normal balance: ${direction}`} />
        <StatCard label="Debits" value={<Amount value={periodDebit} />} hint={`${inRange._count} entries`} />
        <StatCard label="Credits" value={<Amount value={periodCredit} />} />
        <StatCard label={`Closing ${formatDmy(to)}`} value={<Amount value={closing} />} tone={closing < 0 ? "danger" : "default"} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <Card className="lg:col-span-3">
          <CardHeader
            title="Ledger"
            description={account.isGroup ? "All accounts under this heading." : undefined}
            actions={
              <a href={`/finance/entries/export?account=${id}&from=${from}&to=${to}`} className={buttonClass("secondary", "sm")}>
                Export
              </a>
            }
          />
          <form className="flex flex-wrap items-end gap-3 border-b border-line px-4 py-3">
            <FilterField label="From">
              <Input type="date" name="from" defaultValue={from} className="w-40" />
            </FilterField>
            <FilterField label="To">
              <Input type="date" name="to" defaultValue={to} className="w-40" />
            </FilterField>
            <button type="submit" className={buttonClass("secondary")}>
              Apply
            </button>
          </form>
          <Table>
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Document</TH>
                <TH>Description</TH>
                <TH align="right">Debit</TH>
                <TH align="right">Credit</TH>
                <TH align="right">Balance</TH>
              </tr>
            </THead>
            <TBody>
              <tr className="bg-muted/30">
                <TD className="text-ink-soft">{formatDmy(from)}</TD>
                <TD colSpan={4} className="font-medium text-ink-soft">
                  Opening balance
                </TD>
                <TD align="right" className="font-medium">
                  <Amount value={opening} />
                </TD>
              </tr>
              {rows.length === 0 && <EmptyRow colSpan={6}>No entries in this period.</EmptyRow>}
              {rows.map((e) => {
                const href = sourceHref(e.sourceType, e.sourceId, payments);
                return (
                  <TR key={e.id}>
                    <TD className="whitespace-nowrap text-ink-soft">{formatDmy(e.postingDate)}</TD>
                    <TD className="whitespace-nowrap">
                      <span className="block text-xs text-ink-soft">{e.documentType}</span>
                      {href ? (
                        <Link href={href} className="text-brand-700 hover:underline">
                          {e.documentNo ?? "View"}
                        </Link>
                      ) : (
                        (e.documentNo ?? "—")
                      )}
                      {e.reversed && (
                        <span className="ml-1.5">
                          <Badge tone="amber">Reversed</Badge>
                        </span>
                      )}
                    </TD>
                    <TD>
                      {e.description ?? "—"}
                      {account.isGroup && <span className="ml-1 text-xs text-ink-faint">({e.account.code})</span>}
                      {e.contact && (
                        <Link href={`/contacts/${e.contact.id}`} className="block text-xs text-ink-soft hover:underline">
                          {e.contact.name}
                        </Link>
                      )}
                    </TD>
                    <TD align="right">{e.debit ? <Amount value={e.debit} /> : ""}</TD>
                    <TD align="right">{e.credit ? <Amount value={e.credit} /> : ""}</TD>
                    <TD align="right">
                      <Amount value={e.balance} />
                    </TD>
                  </TR>
                );
              })}
              {inRange._count > LIMIT && (
                <tr>
                  <td colSpan={6} className="px-4 py-3 text-center text-xs text-ink-soft">
                    Showing the first {LIMIT} of {inRange._count} entries. Narrow the date range, or{" "}
                    <Link href={`/finance/entries?account=${id}&from=${from}&to=${to}`} className="text-brand-700 hover:underline">
                      open them in G/L entries
                    </Link>
                    .
                  </td>
                </tr>
              )}
            </TBody>
          </Table>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader title="Details" />
          <CardBody>
            <DetailList
              items={[
                { label: "Type", value: ACCOUNT_TYPE_LABELS[account.type] },
                { label: "Schedule III category", value: account.category },
                {
                  label: "Heading",
                  value: account.parent && (
                    <Link href={`/finance/accounts/${account.parent.id}`} className="text-brand-700 hover:underline">
                      {account.parent.code} {account.parent.name}
                    </Link>
                  ),
                },
                { label: "Cash flow group", value: account.cashFlowGroup },
                { label: "Direct posting", value: account.isGroup ? "Heading" : account.directPosting ? "Yes" : "No (control account)" },
                { label: "Posting keys", value: account.postingAccounts.map((p) => p.key).join(", ") || null },
                {
                  label: "Accounts under it",
                  value: account.children.length
                    ? account.children.map((c) => (
                        <Link key={c.id} href={`/finance/accounts/${c.id}`} className="block text-brand-700 hover:underline">
                          {c.code} {c.name}
                        </Link>
                      ))
                    : null,
                },
                { label: "Description", value: account.description },
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
