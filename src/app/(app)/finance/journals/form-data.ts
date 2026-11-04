import "server-only";
import { db } from "@/lib/db";
import { getPostingAccountOptions } from "@/lib/finance/queries";
import { num } from "@/lib/format";
import { isoFromDay } from "@/lib/ops/dates";
import { getBranchOptions, getDimensionOptions } from "../_gl/server";
import type { JournalFormValues } from "./journal-form";

/** Pickers for the journal voucher form: direct-posting accounts, contacts, dimensions, branches. */
export async function journalFormOptions() {
  const [accounts, contacts, dimensions, branches, opening] = await Promise.all([
    getPostingAccountOptions({ journalOnly: true }),
    db.contact.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true }, take: 2000 }),
    getDimensionOptions(),
    getBranchOptions(),
    db.postingAccount.findUnique({ where: { key: "OPENING_BALANCE" }, select: { accountId: true } }),
  ]);
  return { accounts, contacts, dimensions, branches, openingAccountId: opening?.accountId ?? null };
}

/** Journal + lines → form values (used for editing drafts and "copy as new"). */
export async function journalFormValues(id: string, overrides: Partial<JournalFormValues> = {}): Promise<JournalFormValues | null> {
  const j = await db.journal.findUnique({ where: { id }, include: { lines: { orderBy: { position: "asc" } } } });
  if (!j) return null;
  return {
    date: isoFromDay(j.date),
    kind: j.kind,
    narration: j.narration ?? "",
    branchId: j.branchId ?? "",
    lines: j.lines.map((l) => ({
      accountId: l.accountId,
      description: l.description ?? "",
      debit: num(l.debit) ? String(num(l.debit)) : "",
      credit: num(l.credit) ? String(num(l.credit)) : "",
      contactId: l.contactId ?? "",
      dimensions: (l.dimensions ?? {}) as Record<string, string>,
    })),
    ...overrides,
  };
}
