import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { formatDateTime, humanize, num } from "@/lib/format";
import { formatDmy, todayIso } from "@/lib/ops/dates";
import { can } from "@/lib/permissions";
import { JOURNAL_STATUS_TONE, journalTotals } from "../../_gl/ledger";
import { Amount, dimensionText } from "../../_gl/ui";
import { deleteJournal, postJournal, reverseJournal, updateJournal } from "../actions";
import { journalFormOptions, journalFormValues } from "../form-data";
import { JournalForm } from "../journal-form";

export const metadata: Metadata = { title: "General Journal" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function JournalPage({ params }: PageProps<"/finance/journals/[id]">) {
  const user = await requireUser("finance", "view");
  await ensureFinanceSetup();
  const { id } = await params;
  const journal = await db.journal.findUnique({
    where: { id },
    include: { lines: { orderBy: { position: "asc" }, include: { account: { select: { id: true, code: true, name: true } } } } },
  });
  if (!journal) notFound();
  const canEdit = can(user, "finance", "edit");
  const draft = journal.status === "DRAFT";

  const [contacts, branch, postedBy] = await Promise.all([
    db.contact.findMany({ where: { id: { in: journal.lines.map((l) => l.contactId).filter((c): c is string => !!c) } }, select: { id: true, name: true } }),
    journal.branchId ? db.branch.findUnique({ where: { id: journal.branchId }, select: { name: true } }) : null,
    journal.postedById ? db.user.findUnique({ where: { id: journal.postedById }, select: { name: true } }) : null,
  ]);
  const contactName = new Map(contacts.map((c) => [c.id, c.name]));
  const totals = journalTotals(journal.lines.map((l) => ({ debit: num(l.debit), credit: num(l.credit) })));

  const header = (
    <PageHeader
      title={
        <span className="flex items-center gap-3">
          {journal.number} <Badge tone={JOURNAL_STATUS_TONE[journal.status]}>{humanize(journal.status)}</Badge>
        </span>
      }
      description={`${journal.kind} journal · ${formatDmy(journal.date)}`}
      back={{ href: "/finance/journals", label: "General Journals" }}
      actions={
        <>
          {canEdit && draft && (
            <ActionButton action={deleteJournal.bind(null, id)} variant="ghost" confirmMessage="Delete this draft journal?">
              Delete
            </ActionButton>
          )}
          {canEdit && (
            <ButtonLink href={`/finance/journals/new?copy=${id}`} variant="secondary">
              Copy as new
            </ButtonLink>
          )}
          <ButtonLink href={`/finance/journals/${id}/print`} variant="secondary">
            Print
          </ButtonLink>
          {canEdit && journal.status === "POSTED" && (
            <ActionButton
              action={reverseJournal.bind(null, id)}
              variant="secondary"
              pendingText="Reversing…"
              confirmMessage="Post a reversal of this journal?"
              fields={<Input type="date" name="date" defaultValue={todayIso()} aria-label="Reversal date" className="w-40" required />}
            >
              Reverse
            </ActionButton>
          )}
          {canEdit && draft && (
            <ActionButton action={postJournal.bind(null, id)} variant="primary" pendingText="Posting…" confirmMessage="Post this journal to the ledger? It can’t be edited afterwards.">
              Post
            </ActionButton>
          )}
        </>
      }
    />
  );

  if (draft && canEdit) {
    const [options, initial] = await Promise.all([journalFormOptions(), journalFormValues(id)]);
    return (
      <>
        {header}
        <JournalForm action={updateJournal.bind(null, id)} initial={initial!} {...options} cancelHref="/finance/journals" />
      </>
    );
  }

  return (
    <>
      {header}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Lines" />
          <Table>
            <THead>
              <tr>
                <TH>Account</TH>
                <TH>Description</TH>
                <TH align="right">Debit Amount</TH>
                <TH align="right">Credit Amount</TH>
              </tr>
            </THead>
            <TBody>
              {journal.lines.map((l) => (
                <TR key={l.id}>
                  <TD>
                    <Link href={`/finance/accounts/${l.account.id}`} className="text-brand-700 hover:underline">
                      {l.account.code} {l.account.name}
                    </Link>
                    {l.contactId && <span className="block text-xs text-ink-soft">{contactName.get(l.contactId)}</span>}
                    {dimensionText(l.dimensions) && <span className="block text-xs text-ink-faint">{dimensionText(l.dimensions)}</span>}
                  </TD>
                  <TD className="text-ink-soft">{l.description ?? "—"}</TD>
                  <TD align="right">{num(l.debit) ? <Amount value={num(l.debit)} /> : ""}</TD>
                  <TD align="right">{num(l.credit) ? <Amount value={num(l.credit)} /> : ""}</TD>
                </TR>
              ))}
              <tr className="bg-muted/40 font-semibold">
                <TD colSpan={2}>Total</TD>
                <TD align="right">
                  <Amount value={totals.debit} />
                </TD>
                <TD align="right">
                  <Amount value={totals.credit} />
                </TD>
              </tr>
            </TBody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <DetailList
              items={[
                { label: "Kind", value: journal.kind },
                { label: "Posting Date", value: formatDmy(journal.date) },
                { label: "Branch", value: branch?.name },
                { label: "Description", value: journal.narration },
                {
                  label: "Transaction",
                  value: journal.transactionNo && (
                    <Link href={`/finance/entries?transactionNo=${journal.transactionNo}`} className="text-brand-700 hover:underline">
                      {journal.transactionNo}
                    </Link>
                  ),
                },
                {
                  label: "Reversal transaction",
                  value: journal.reversalTxNo && (
                    <Link href={`/finance/entries?transactionNo=${journal.reversalTxNo}`} className="text-brand-700 hover:underline">
                      {journal.reversalTxNo}
                    </Link>
                  ),
                },
                { label: "Posted", value: journal.postedAt ? `${formatDateTime(journal.postedAt)}${postedBy ? ` by ${postedBy.name}` : ""}` : null },
              ]}
            />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
