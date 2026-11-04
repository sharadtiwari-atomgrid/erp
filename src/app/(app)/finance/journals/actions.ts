"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { diff, recordChange } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db, type Tx } from "@/lib/db";
import { postTransaction, reverseTransaction } from "@/lib/finance/posting";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { dayFromIso, isoFromDay, parseDay } from "@/lib/ops/dates";
import { nextDocumentNumber } from "@/lib/sequence";
import { JOURNAL_KINDS, validateJournalLines, withOpeningBalanceLine, type JournalLineDraft } from "../_gl/ledger";
import { attempt } from "../_gl/server";

const headerSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date"),
  kind: z.enum(JOURNAL_KINDS, { error: "Choose a kind" }),
  narration: f.optionalText(),
  branchId: f.optionalText(),
});

const lineSchema = z.object({
  accountId: z.string().default(""),
  description: z.string().trim().nullish(),
  debit: z.coerce.number().default(0),
  credit: z.coerce.number().default(0),
  contactId: z.string().nullish(),
  dimensions: z.record(z.string(), z.string()).default({}),
});

async function readJournal(formData: FormData) {
  const parsed = parseForm(headerSchema, formData);
  if (!parsed.ok) return { ok: false as const, state: parsed.state };
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { ok: false as const, state: { error: "Could not read the journal lines." } };
  }
  const lines = z.array(lineSchema).safeParse(raw);
  if (!lines.success) return { ok: false as const, state: { error: "Could not read the journal lines." } };
  const cleaned: JournalLineDraft[] = lines.data.map((l) => ({
    ...l,
    description: l.description || null,
    contactId: l.contactId || null,
    dimensions: Object.fromEntries(Object.entries(l.dimensions).filter(([, v]) => v)),
  }));
  const valid = validateJournalLines(cleaned);
  if (!valid.ok) return { ok: false as const, state: { error: valid.error } };

  // Only posting accounts allowed in journals.
  const accounts = await db.glAccount.findMany({ where: { id: { in: valid.lines.map((l) => l.accountId) } }, select: { id: true, code: true, name: true, isGroup: true, directPosting: true, isActive: true } });
  const byId = new Map(accounts.map((a) => [a.id, a]));
  for (const [i, l] of valid.lines.entries()) {
    const a = byId.get(l.accountId);
    if (!a) return { ok: false as const, state: { error: `Line ${i + 1}: the account no longer exists.` } };
    if (a.isGroup || !a.directPosting) return { ok: false as const, state: { error: `Line ${i + 1}: ${a.code} ${a.name} can't be used in journals.` } };
    if (!a.isActive) return { ok: false as const, state: { error: `Line ${i + 1}: ${a.code} ${a.name} is blocked.` } };
  }

  let finalLines = valid.lines;
  if (parsed.data.kind === "Opening balance") {
    const ob = await db.postingAccount.findUnique({ where: { key: "OPENING_BALANCE" } });
    if (!ob) return { ok: false as const, state: { error: "Map the OPENING_BALANCE posting key in Posting setup first." } };
    finalLines = withOpeningBalanceLine(valid.lines, ob.accountId);
  }
  return { ok: true as const, header: parsed.data, lines: finalLines };
}

function lineRows(lines: JournalLineDraft[]) {
  return lines.map((l, position) => ({
    accountId: l.accountId,
    description: l.description ?? null,
    debit: l.debit,
    credit: l.credit,
    contactId: l.contactId ?? null,
    dimensions: l.dimensions ?? {},
    position,
  }));
}

function revalidateJournal(id?: string) {
  revalidatePath("/finance/journals");
  if (id) revalidatePath(`/finance/journals/${id}`);
}

export async function createJournal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  await ensureFinanceSetup();
  const read = await readJournal(formData);
  if (!read.ok) return read.state;
  const { header, lines } = read;
  const journal = await db.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, "JOURNAL");
    const created = await tx.journal.create({
      data: { number, date: dayFromIso(header.date), kind: header.kind, narration: header.narration, branchId: header.branchId, lines: { create: lineRows(lines) } },
    });
    await recordChange({ userId: user.id, entityType: "Journal", entityId: created.id, action: "created", message: `Journal ${number} created` }, tx);
    return created;
  });
  revalidateJournal();
  redirect(`/finance/journals/${journal.id}`);
}

export async function updateJournal(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const before = await db.journal.findUnique({ where: { id } });
  if (!before) return { error: "This journal no longer exists." };
  if (before.status !== "DRAFT") return { error: "Posted journals can't be edited. Reverse it instead." };
  const read = await readJournal(formData);
  if (!read.ok) return read.state;
  const { header, lines } = read;
  await db.$transaction(async (tx) => {
    await tx.journalLine.deleteMany({ where: { journalId: id } });
    const after = await tx.journal.update({
      where: { id },
      data: { date: dayFromIso(header.date), kind: header.kind, narration: header.narration, branchId: header.branchId, lines: { create: lineRows(lines) } },
    });
    await recordChange({ userId: user.id, entityType: "Journal", entityId: id, action: "updated", message: `Journal ${after.number} updated`, changes: { ...diff(before, after), lines: ["", `${lines.length} lines`] } }, tx);
  });
  revalidateJournal(id);
  return { success: "Journal saved." };
}

export async function deleteJournal(id: string): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const journal = await db.journal.findUnique({ where: { id } });
  if (!journal) return { error: "This journal no longer exists." };
  if (journal.status !== "DRAFT") return { error: "Only draft journals can be deleted. Reverse a posted journal instead." };
  await db.$transaction(async (tx) => {
    await tx.journal.delete({ where: { id } });
    await recordChange({ userId: user.id, entityType: "Journal", entityId: id, action: "deleted", message: `Draft journal ${journal.number} deleted` }, tx);
  });
  revalidateJournal();
  redirect("/finance/journals");
}

async function branchDimension(tx: Tx, branchId: string | null): Promise<Record<string, string>> {
  if (!branchId) return {};
  const [branch, dim] = await Promise.all([
    tx.branch.findUnique({ where: { id: branchId }, select: { code: true } }),
    tx.dimension.findUnique({ where: { code: "BRANCH" }, select: { id: true } }),
  ]);
  return branch && dim ? { BRANCH: branch.code } : {};
}

export async function postJournal(id: string): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  await ensureFinanceSetup();
  const journal = await db.journal.findUnique({ where: { id }, include: { lines: { orderBy: { position: "asc" } } } });
  if (!journal) return { error: "This journal no longer exists." };
  if (journal.status !== "DRAFT") return { error: "This journal has already been posted." };
  const lines: JournalLineDraft[] = journal.lines.map((l) => ({
    accountId: l.accountId,
    description: l.description,
    debit: Number(l.debit),
    credit: Number(l.credit),
    contactId: l.contactId,
    dimensions: (l.dimensions ?? {}) as Record<string, string>,
  }));
  const valid = validateJournalLines(lines, { forPosting: true });
  if (!valid.ok) return { error: valid.error };

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const transactionNo = await postTransaction(tx, {
        date: isoFromDay(journal.date),
        documentType: journal.kind === "Opening balance" ? "Opening" : "Journal",
        documentNo: journal.number,
        sourceType: "Journal",
        sourceId: journal.id,
        description: journal.narration ?? `${journal.kind} journal ${journal.number}`,
        branchId: journal.branchId,
        dimensions: await branchDimension(tx, journal.branchId),
        userId: user.id,
        allowControlAccounts: false,
        lines: valid.lines.map((l) => ({
          account: { id: l.accountId },
          debit: l.debit,
          credit: l.credit,
          description: l.description ?? journal.narration ?? null,
          contactId: l.contactId,
          dimensions: l.dimensions,
        })),
      });
      await tx.journal.update({ where: { id }, data: { status: "POSTED", transactionNo, postedAt: new Date(), postedById: user.id } });
      await recordChange({ userId: user.id, entityType: "Journal", entityId: id, action: "posted", message: `Journal ${journal.number} posted as transaction ${transactionNo}` }, tx);
      return transactionNo;
    }),
  );
  if (!result.ok) return { error: result.error };
  revalidateJournal(id);
  revalidatePath("/finance/entries");
  return { success: `Posted as transaction ${result.value}.` };
}

export async function reverseJournal(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const journal = await db.journal.findUnique({ where: { id } });
  if (!journal) return { error: "This journal no longer exists." };
  if (journal.status !== "POSTED" || !journal.transactionNo) return { error: "Only posted journals can be reversed." };
  const date = parseDay(formData.get("date"));
  if (!date) return { error: "Choose the reversal date." };
  if (date < isoFromDay(journal.date)) return { error: "The reversal can't be dated before the journal." };
  const txNo = journal.transactionNo;

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const reversalTxNo = await reverseTransaction(tx, txNo, { date, userId: user.id, reason: `Reversal of journal ${journal.number}` });
      await tx.journal.update({ where: { id }, data: { status: "REVERSED", reversalTxNo } });
      await recordChange({ userId: user.id, entityType: "Journal", entityId: id, action: "reversed", message: `Journal ${journal.number} reversed on ${date} (transaction ${reversalTxNo})` }, tx);
      return reversalTxNo;
    }),
  );
  if (!result.ok) return { error: result.error };
  revalidateJournal(id);
  revalidatePath("/finance/entries");
  return { success: `Reversed as transaction ${result.value}.` };
}
