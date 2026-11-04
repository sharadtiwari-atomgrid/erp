"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordChange } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { money } from "@/lib/finance/chart";
import { postTransaction } from "@/lib/finance/posting";
import { formatMoney, num } from "@/lib/format";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { dayFromIso, formatDmy, isoFromDay } from "@/lib/ops/dates";
import { autoMatch, manualMatchProblem } from "../_cash_fa/matching";
import { attempt, CashFaError, OPENING_BATCH, reconciliationFigures, unclearedEntries } from "../_cash_fa/server";
import { dropDuplicates, duplicateKey } from "../_cash_fa/statement";

function refresh(bankAccountId: string) {
  revalidatePath("/finance/bank-reconciliation");
  revalidatePath(`/finance/bank-reconciliation/${bankAccountId}`);
  revalidatePath(`/finance/bank-accounts/${bankAccountId}`);
  revalidatePath("/finance/bank-accounts");
}

async function bankOrError(id: string) {
  const bank = await db.bankAccount.findUnique({ where: { id }, select: { id: true, code: true, name: true, glAccountId: true } });
  if (!bank) throw new CashFaError("Bank account not found.");
  return bank;
}

const importedLine = z.object({
  date: z.iso.date(),
  description: z.string().trim().min(1).max(500),
  reference: z.string().trim().max(200).nullable(),
  amount: z.number().refine((n) => Number.isFinite(n) && money(n) !== 0, "Amount cannot be zero"),
  balance: z.number().nullable(),
});

/** Saves parsed statement lines, skipping ones already imported (same date + amount + reference). */
export async function importStatement(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const bankAccountId = String(formData.get("bankAccountId") ?? "");
  if (!bankAccountId) return { error: "Choose the bank account." };
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("lines") ?? "[]"));
  } catch {
    return { error: "Could not read the statement lines." };
  }
  const parsed = z.array(importedLine).min(1, "There are no lines to import.").max(5000, "Import at most 5,000 lines at a time.").safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid statement lines." };
  const fileName = String(formData.get("fileName") ?? "").slice(0, 120);

  const result = await attempt(async () => {
    const bank = await bankOrError(bankAccountId);
    const dates = parsed.data.map((l) => l.date).sort();
    const existing = await db.bankStatementLine.findMany({
      where: { bankAccountId, date: { gte: dayFromIso(dates[0]), lte: dayFromIso(dates.at(-1)!) }, importBatch: { not: OPENING_BATCH } },
      select: { date: true, amount: true, reference: true },
    });
    const { fresh, duplicates } = dropDuplicates(
      parsed.data,
      existing.map((e) => duplicateKey({ date: isoFromDay(e.date), amount: num(e.amount), reference: e.reference })),
    );
    const batch = `${new Date().toISOString().slice(0, 10)} ${fileName || "import"} ${randomUUID().slice(0, 8)}`;
    if (fresh.length) {
      await db.$transaction(async (tx) => {
        await tx.bankStatementLine.createMany({
          data: fresh.map((l) => ({
            bankAccountId,
            date: dayFromIso(l.date),
            description: l.description,
            reference: l.reference,
            amount: money(l.amount),
            balance: l.balance,
            importBatch: batch,
          })),
        });
        await recordChange(
          { userId: user.id, entityType: "BankAccount", entityId: bankAccountId, action: "imported", message: `${fresh.length} statement lines imported for ${bank.name}${duplicates ? ` (${duplicates} duplicates skipped)` : ""}` },
          tx,
        );
      });
    }
    return { imported: fresh.length, duplicates };
  });
  if (!result.ok) return { error: result.error };
  refresh(bankAccountId);
  const { imported, duplicates } = result.value;
  return { success: `Imported ${imported} line${imported === 1 ? "" : "s"}${duplicates ? `; skipped ${duplicates} duplicate${duplicates === 1 ? "" : "s"}` : ""}.` };
}

/** Matches unmatched lines to uncleared entries by exact amount, date ±3 days and reference. */
export async function autoMatchLines(bankAccountId: string): Promise<ActionState> {
  await requireUser("finance", "edit");
  const result = await attempt(async () => {
    const bank = await bankOrError(bankAccountId);
    const [lines, entries] = await Promise.all([
      db.bankStatementLine.findMany({ where: { bankAccountId, status: "UNMATCHED" } }),
      unclearedEntries(bankAccountId, bank.glAccountId),
    ]);
    const matches = autoMatch(
      lines.map((l) => ({ id: l.id, date: isoFromDay(l.date), amount: num(l.amount), reference: l.reference, description: l.description })),
      entries.map((e) => ({ id: e.id, date: isoFromDay(e.postingDate), debit: num(e.debit), credit: num(e.credit), documentNo: e.documentNo, description: e.description })),
    );
    await db.$transaction(async (tx) => {
      for (const m of matches) {
        await tx.bankStatementLine.updateMany({ where: { id: m.lineId, status: "UNMATCHED" }, data: { status: "MATCHED", matchedEntryIds: [m.entryId] } });
      }
    });
    return { matched: matches.length, left: lines.length - matches.length };
  });
  if (!result.ok) return { error: result.error };
  refresh(bankAccountId);
  return { success: `Matched ${result.value.matched} line${result.value.matched === 1 ? "" : "s"}; ${result.value.left} left to match.` };
}

/** Matches one statement line to one or more ledger entries whose amounts add up to it. */
export async function matchLine(bankAccountId: string, lineId: string, entryIds: string[]): Promise<ActionState> {
  await requireUser("finance", "edit");
  const result = await attempt(async () => {
    const bank = await bankOrError(bankAccountId);
    const line = await db.bankStatementLine.findUnique({ where: { id: lineId } });
    if (!line || line.bankAccountId !== bankAccountId) throw new CashFaError("Statement line not found.");
    if (line.status !== "UNMATCHED") throw new CashFaError("This line is already matched or ignored.");
    const ids = [...new Set(entryIds)];
    const uncleared = await unclearedEntries(bankAccountId, bank.glAccountId);
    const chosen = uncleared.filter((e) => ids.includes(e.id));
    if (chosen.length !== ids.length) throw new CashFaError("Some of the chosen entries are already matched or are not on this bank's ledger account.");
    const problem = manualMatchProblem({ amount: num(line.amount) }, chosen.map((e) => ({ debit: num(e.debit), credit: num(e.credit) })));
    if (problem) throw new CashFaError(problem);
    await db.bankStatementLine.update({ where: { id: lineId }, data: { status: "MATCHED", matchedEntryIds: ids } });
  });
  if (!result.ok) return { error: result.error };
  refresh(bankAccountId);
  return { success: "Matched." };
}

async function setLineStatus(lineId: string, from: string[], to: "UNMATCHED" | "IGNORED"): Promise<ActionState> {
  await requireUser("finance", "edit");
  const line = await db.bankStatementLine.findUnique({ where: { id: lineId } });
  if (!line) return { error: "Statement line not found." };
  if (line.reconciledAt) return { error: "This line is part of a completed reconciliation and can't be changed." };
  if (!from.includes(line.status)) return { error: "This line has changed; refresh the page." };
  await db.bankStatementLine.update({ where: { id: lineId }, data: { status: to, matchedEntryIds: [] } });
  refresh(line.bankAccountId);
  return undefined;
}

export async function unmatchLine(lineId: string): Promise<ActionState> {
  return setLineStatus(lineId, ["MATCHED"], "UNMATCHED");
}

export async function ignoreLine(lineId: string): Promise<ActionState> {
  return setLineStatus(lineId, ["UNMATCHED"], "IGNORED");
}

export async function restoreLine(lineId: string): Promise<ActionState> {
  return setLineStatus(lineId, ["IGNORED"], "UNMATCHED");
}

/** Deletes a wrongly imported line (only while unmatched or ignored). */
export async function deleteLine(lineId: string): Promise<ActionState> {
  await requireUser("finance", "edit");
  const line = await db.bankStatementLine.findUnique({ where: { id: lineId } });
  if (!line) return { error: "Statement line not found." };
  if (line.status === "MATCHED" || line.reconciledAt) return { error: "Unmatch the line before deleting it." };
  await db.bankStatementLine.delete({ where: { id: lineId } });
  refresh(line.bankAccountId);
  return undefined;
}

const entrySchema = z.object({
  lineId: f.id("Statement line"),
  accountId: f.id("Account"),
  date: z.iso.date("Enter a valid date"),
  description: f.optionalText(),
});

/**
 * Books a line the ledger doesn't have yet (bank charges, interest…):
 * withdrawal → Dr chosen account / Cr bank; deposit → Dr bank / Cr chosen account.
 * The line is then matched to the new bank entry.
 */
export async function createEntryFromLine(bankAccountId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const parsed = parseForm(entrySchema, formData);
  if (!parsed.ok) return parsed.state;
  const { lineId, accountId, date, description } = parsed.data;

  const result = await attempt(async () => {
    const bank = await bankOrError(bankAccountId);
    if (accountId === bank.glAccountId) throw new CashFaError("Choose an account other than the bank itself.");
    return db.$transaction(async (tx) => {
      const line = await tx.bankStatementLine.findUnique({ where: { id: lineId } });
      if (!line || line.bankAccountId !== bankAccountId) throw new CashFaError("Statement line not found.");
      if (line.status !== "UNMATCHED") throw new CashFaError("This line is already matched or ignored.");
      const amount = num(line.amount);
      const abs = Math.abs(amount);
      const text = description ?? line.description;
      const transactionNo = await postTransaction(tx, {
        date,
        documentType: "Bank statement",
        documentNo: line.reference ?? `${bank.code}-${formatDmy(line.date)}`,
        sourceType: "BankStatementLine",
        sourceId: line.id,
        description: text,
        userId: user.id,
        allowControlAccounts: false,
        lines:
          amount < 0
            ? [
                { account: { id: accountId }, debit: abs },
                { account: { id: bank.glAccountId }, credit: abs },
              ]
            : [
                { account: { id: bank.glAccountId }, debit: abs },
                { account: { id: accountId }, credit: abs },
              ],
      });
      const bankEntry = await tx.glEntry.findFirstOrThrow({ where: { transactionNo, accountId: bank.glAccountId }, select: { id: true } });
      await tx.bankStatementLine.update({ where: { id: lineId }, data: { status: "MATCHED", matchedEntryIds: [bankEntry.id] } });
      await recordChange(
        { userId: user.id, entityType: "BankAccount", entityId: bankAccountId, action: "posted", message: `Entry for statement line “${line.description}” (${formatMoney(amount)}) posted as transaction ${transactionNo}` },
        tx,
      );
      return transactionNo;
    });
  });
  if (!result.ok) return { error: result.error };
  refresh(bankAccountId);
  revalidatePath("/finance", "layout");
  return { success: `Posted as transaction ${result.value} and matched.` };
}

const clearSchema = z.object({ upTo: z.iso.date("Enter a valid date") });

/**
 * Marks every uncleared ledger entry up to a date as cleared, for entries
 * from before the first imported statement (opening balances). Saved as one
 * statement line in a hidden batch so the entries count as matched.
 */
export async function clearOpeningEntries(bankAccountId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const parsed = parseForm(clearSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { upTo } = parsed.data;
  const result = await attempt(async () => {
    const bank = await bankOrError(bankAccountId);
    const entries = await unclearedEntries(bankAccountId, bank.glAccountId, { toIso: upTo });
    if (entries.length === 0) throw new CashFaError(`There are no uncleared entries up to ${formatDmy(upTo)}.`);
    const net = money(entries.reduce((s, e) => s + num(e.debit) - num(e.credit), 0));
    await db.$transaction(async (tx) => {
      await tx.bankStatementLine.create({
        data: {
          bankAccountId,
          date: dayFromIso(upTo),
          description: `Entries up to ${formatDmy(upTo)} cleared as opening`,
          amount: net,
          status: "MATCHED",
          matchedEntryIds: entries.map((e) => e.id),
          importBatch: OPENING_BATCH,
        },
      });
      await recordChange(
        { userId: user.id, entityType: "BankAccount", entityId: bankAccountId, action: "updated", message: `${entries.length} ledger entries up to ${formatDmy(upTo)} cleared as opening (${formatMoney(net)})`, changes: { clearedOpening: [null, upTo] } },
        tx,
      );
    });
    return entries.length;
  });
  if (!result.ok) return { error: result.error };
  refresh(bankAccountId);
  return { success: `${result.value} entries cleared.` };
}

/** Removes an "opening" clearance so its entries show as uncleared again. */
export async function undoOpeningClear(lineId: string): Promise<ActionState> {
  await requireUser("finance", "edit");
  const line = await db.bankStatementLine.findUnique({ where: { id: lineId } });
  if (!line || line.importBatch !== OPENING_BATCH) return { error: "Not found." };
  if (line.reconciledAt) return { error: "This clearance is part of a completed reconciliation." };
  await db.bankStatementLine.delete({ where: { id: lineId } });
  refresh(line.bankAccountId);
  return undefined;
}

const completeSchema = z.object({
  statementDate: z.iso.date("Enter the statement date"),
  statementBalance: z.coerce.number({ error: "Enter the statement closing balance" }),
  notes: f.optionalText(),
});

/** Saves a completed reconciliation; only allowed when the difference is zero and no line up to the date is unmatched. */
export async function completeReconciliation(bankAccountId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const parsed = parseForm(completeSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { statementDate, statementBalance, notes } = parsed.data;
  const result = await attempt(async () => {
    const bank = await bankOrError(bankAccountId);
    const last = await db.bankReconciliation.findFirst({ where: { bankAccountId, status: "COMPLETED" }, orderBy: { statementDate: "desc" } });
    if (last && isoFromDay(last.statementDate) >= statementDate) {
      throw new CashFaError(`This account is already reconciled up to ${formatDmy(last.statementDate)}. Choose a later statement date.`);
    }
    const { summary, unmatchedLines } = await reconciliationFigures(bankAccountId, bank.glAccountId, statementDate, statementBalance);
    if (unmatchedLines > 0) throw new CashFaError(`${unmatchedLines} statement line${unmatchedLines === 1 ? " is" : "s are"} still unmatched up to ${formatDmy(statementDate)}. Match, book or ignore ${unmatchedLines === 1 ? "it" : "them"} first.`);
    if (summary.difference !== 0) throw new CashFaError(`The difference is ${formatMoney(summary.difference)}. It must be zero to complete the reconciliation.`);
    return db.$transaction(async (tx) => {
      const rec = await tx.bankReconciliation.create({
        data: {
          bankAccountId,
          statementDate: dayFromIso(statementDate),
          statementBalance: summary.statementBalance,
          bookBalance: summary.bookBalance,
          difference: 0,
          status: "COMPLETED",
          notes,
          completedAt: new Date(),
        },
      });
      await tx.bankStatementLine.updateMany({
        where: { bankAccountId, status: { in: ["MATCHED", "IGNORED"] }, reconciledAt: null, date: { lte: dayFromIso(statementDate) } },
        data: { reconciledAt: new Date() },
      });
      await recordChange(
        { userId: user.id, entityType: "BankAccount", entityId: bankAccountId, action: "reconciled", message: `${bank.name} reconciled to ${formatDmy(statementDate)} at ${formatMoney(summary.statementBalance)}` },
        tx,
      );
      return rec;
    });
  });
  if (!result.ok) return { error: result.error };
  refresh(bankAccountId);
  return { success: `Reconciled to ${formatDmy(statementDate)}.` };
}
