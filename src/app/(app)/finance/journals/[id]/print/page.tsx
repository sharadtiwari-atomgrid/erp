import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { PrintButton } from "@/components/ui/print-button";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney, num } from "@/lib/format";
import { getCompany } from "@/lib/options";
import { formatDmy } from "@/lib/ops/dates";
import { journalTotals } from "../../../_gl/ledger";
import { dimensionText } from "../../../_gl/ui";

export const metadata: Metadata = { title: "Print journal voucher" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function PrintJournalPage({ params }: PageProps<"/finance/journals/[id]/print">) {
  await requireUser("finance", "view");
  const { id } = await params;
  const [journal, company] = await Promise.all([
    db.journal.findUnique({ where: { id }, include: { lines: { orderBy: { position: "asc" }, include: { account: { select: { code: true, name: true } } } } } }),
    getCompany(),
  ]);
  if (!journal) notFound();
  const contacts = await db.contact.findMany({ where: { id: { in: journal.lines.map((l) => l.contactId).filter((c): c is string => !!c) } }, select: { id: true, name: true } });
  const contactName = new Map(contacts.map((c) => [c.id, c.name]));
  const totals = journalTotals(journal.lines.map((l) => ({ debit: num(l.debit), credit: num(l.credit) })));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex justify-end gap-2 print:hidden">
        <ButtonLink href={`/finance/journals/${id}`} variant="secondary">
          Back
        </ButtonLink>
        <PrintButton />
      </div>
      <div className="rounded-lg border border-line bg-surface p-8 text-ink print:border-0 print:p-0">
        <div className="flex items-start justify-between border-b border-line pb-4">
          <div>
            <p className="text-lg font-semibold">{company.name}</p>
            <p className="text-xs text-ink-soft">{company.state}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold">Journal voucher</p>
            <p className="text-sm">{journal.number}</p>
            <p className="text-xs text-ink-soft">
              {journal.kind} · {formatDmy(journal.date)} · {journal.status === "DRAFT" ? "Draft (not posted)" : journal.status === "REVERSED" ? "Reversed" : `Transaction ${journal.transactionNo}`}
            </p>
          </div>
        </div>
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft">
              <th className="py-2">Account</th>
              <th className="py-2">Particulars</th>
              <th className="py-2 text-right">Debit</th>
              <th className="py-2 text-right">Credit</th>
            </tr>
          </thead>
          <tbody>
            {journal.lines.map((l) => (
              <tr key={l.id} className="border-b border-line align-top">
                <td className="py-2 pr-3">
                  {l.account.code} {l.account.name}
                </td>
                <td className="py-2 pr-3">
                  {l.description}
                  {l.contactId && <span className="block text-xs text-ink-soft">{contactName.get(l.contactId)}</span>}
                  {dimensionText(l.dimensions) && <span className="block text-xs text-ink-soft">{dimensionText(l.dimensions)}</span>}
                </td>
                <td className="py-2 text-right tabular-nums">{num(l.debit) ? formatMoney(l.debit) : ""}</td>
                <td className="py-2 text-right tabular-nums">{num(l.credit) ? formatMoney(l.credit) : ""}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="py-2" colSpan={2}>
                Total
              </td>
              <td className="py-2 text-right tabular-nums">{formatMoney(totals.debit)}</td>
              <td className="py-2 text-right tabular-nums">{formatMoney(totals.credit)}</td>
            </tr>
          </tbody>
        </table>
        {journal.narration && (
          <p className="mt-4 text-sm">
            <span className="font-medium">Narration: </span>
            {journal.narration}
          </p>
        )}
        <div className="mt-16 grid grid-cols-3 gap-8 text-center text-xs text-ink-soft">
          <p className="border-t border-line pt-2">Prepared by</p>
          <p className="border-t border-line pt-2">Checked by</p>
          <p className="border-t border-line pt-2">Authorised signatory</p>
        </div>
      </div>
    </div>
  );
}
