import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { param } from "@/lib/forms";
import { todayIso } from "@/lib/ops/dates";
import { defaultBranchId } from "@/lib/branch";
import { JOURNAL_KINDS } from "../../_gl/ledger";
import { createJournal } from "../actions";
import { journalFormOptions, journalFormValues } from "../form-data";
import { JournalForm, type JournalFormValues } from "../journal-form";

export const metadata: Metadata = { title: "New General Journal" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function NewJournalPage({ searchParams }: PageProps<"/finance/journals/new">) {
  await requireUser("finance", "edit");
  await ensureFinanceSetup();
  const sp = await searchParams;
  const copy = param(sp, "copy");
  const kindParam = param(sp, "kind");
  const kind = (JOURNAL_KINDS as readonly string[]).includes(kindParam) ? kindParam : "General";
  const [options, branchId] = await Promise.all([journalFormOptions(), defaultBranchId().catch(() => "")]);

  const copied = copy ? await journalFormValues(copy, { date: todayIso() }) : null;
  const initial: JournalFormValues = copied ?? { date: todayIso(), kind, narration: "", branchId, lines: [] };

  return (
    <>
      <PageHeader
        title={copied ? `Copy ${kind}` : kind === "Opening balance" ? "Opening Balances" : `${kind} Voucher`}
        description={
          kind === "Opening balance" && !copied
            ? "Enter balances brought forward on the go-live date. The difference goes to opening balance equity."
            : `${kind} voucher. Enter balanced debit and credit lines; control accounts (receivables, payables, GST…) remain document-controlled.`
        }
        back={{ href: "/finance/journals", label: "General Journals" }}
      />
      <JournalForm action={createJournal} initial={initial} {...options} cancelHref="/finance/journals" />
    </>
  );
}
