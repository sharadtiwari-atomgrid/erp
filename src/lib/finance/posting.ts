import "server-only";
import type { Tx } from "@/lib/db";
import { dayFromIso, isoFromDay } from "@/lib/ops/dates";
import { assertBalanced, money, type PostingKey } from "./chart";
import { ensureFiscalYear, ensureFinanceSetup } from "./setup";

/** A business-rule failure while posting (closed period, unbalanced lines…); safe to show to users. */
export class FinanceError extends Error {}

export type AccountRef = PostingKey | { id: string } | { code: string };

export type PostingLineInput = {
  account: AccountRef;
  debit?: number;
  credit?: number;
  description?: string | null;
  contactId?: string | null;
  dimensions?: Record<string, string>;
};

export type PostingInput = {
  /** ISO date (YYYY-MM-DD) or a Date at UTC midnight. */
  date: string | Date;
  /** Sales invoice | Payment | Cash receipt | Purchase invoice | Vendor payment | Journal | Depreciation | … */
  documentType: string;
  documentNo?: string | null;
  sourceType?: string;
  sourceId?: string;
  description?: string | null;
  contactId?: string | null;
  branchId?: string | null;
  dimensions?: Record<string, string>;
  userId?: string | null;
  /** Manual journals pass false: control accounts (receivables, GST…) are posted only by documents. */
  allowControlAccounts?: boolean;
  lines: PostingLineInput[];
};

const LOCK = 731_100;

async function resolveAccount(tx: Tx, ref: AccountRef) {
  const account =
    typeof ref === "string"
      ? (await tx.postingAccount.findUnique({ where: { key: ref }, include: { account: true } }))?.account
      : "id" in ref
        ? await tx.glAccount.findUnique({ where: { id: ref.id } })
        : await tx.glAccount.findUnique({ where: { code: ref.code } });
  if (!account) throw new FinanceError(`No ledger account is set up for ${typeof ref === "string" ? ref : JSON.stringify(ref)}.`);
  if (account.isGroup) throw new FinanceError(`${account.code} ${account.name} is a heading; post to one of its accounts instead.`);
  if (!account.isActive) throw new FinanceError(`${account.code} ${account.name} is blocked.`);
  return account;
}

/** Throws a FinanceError if the date falls in a closed period or financial year. */
export async function assertPeriodOpen(tx: Tx, iso: string) {
  await ensureFiscalYear(tx, iso);
  const day = dayFromIso(iso);
  const period = await tx.accountingPeriod.findFirst({
    where: { startDate: { lte: day }, endDate: { gte: day } },
    include: { fiscalYear: { select: { name: true, closed: true } } },
  });
  if (period?.fiscalYear.closed) throw new FinanceError(`${period.fiscalYear.name} is closed. Choose a date in an open year.`);
  if (period?.closed) throw new FinanceError(`The ${period.name} period is closed. Choose a date in an open period.`);
}

/**
 * Posts one balanced transaction to the general ledger and returns its
 * transaction number. Call inside a db.$transaction.
 */
export async function postTransaction(tx: Tx, input: PostingInput): Promise<number> {
  await ensureFinanceSetup(tx);
  const iso = typeof input.date === "string" ? input.date : isoFromDay(input.date);
  const lines = input.lines
    .map((l) => ({ ...l, debit: money(l.debit ?? 0), credit: money(l.credit ?? 0) }))
    .filter((l) => l.debit !== 0 || l.credit !== 0);
  try {
    assertBalanced(lines);
  } catch (e) {
    throw new FinanceError(e instanceof Error ? e.message : String(e));
  }
  await assertPeriodOpen(tx, iso);

  const resolved = [];
  for (const l of lines) {
    const account = await resolveAccount(tx, l.account);
    if (input.allowControlAccounts === false && !account.directPosting) {
      throw new FinanceError(`${account.code} ${account.name} is posted only by documents, not by journals.`);
    }
    resolved.push({ ...l, account });
  }

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK})`;
  const agg = await tx.glEntry.aggregate({ _max: { transactionNo: true } });
  const transactionNo = (agg._max.transactionNo ?? 0) + 1;

  await tx.glEntry.createMany({
    data: resolved.map((l) => ({
      transactionNo,
      postingDate: dayFromIso(iso),
      accountId: l.account.id,
      debit: l.debit,
      credit: l.credit,
      description: l.description ?? input.description ?? null,
      documentType: input.documentType,
      documentNo: input.documentNo ?? null,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      contactId: l.contactId ?? input.contactId ?? null,
      branchId: input.branchId ?? null,
      dimensions: { ...(input.dimensions ?? {}), ...(l.dimensions ?? {}) },
      createdById: input.userId ?? null,
    })),
  });
  return transactionNo;
}

/** Latest posted (not reversed) transaction for a source document, or null. */
export async function findPostedTransaction(tx: Tx, sourceType: string, sourceId: string): Promise<number | null> {
  const entry = await tx.glEntry.findFirst({
    where: { sourceType, sourceId, reversed: false, documentType: { not: "Reversal" } },
    orderBy: { transactionNo: "desc" },
    select: { transactionNo: true },
  });
  return entry?.transactionNo ?? null;
}

/** Posts the exact opposite of a transaction and marks both as reversed. Returns the new transaction number. */
export async function reverseTransaction(
  tx: Tx,
  transactionNo: number,
  opts: { date?: string | Date; userId?: string | null; reason?: string } = {},
): Promise<number> {
  const entries = await tx.glEntry.findMany({ where: { transactionNo }, orderBy: { entryNo: "asc" } });
  if (entries.length === 0) throw new FinanceError(`Transaction ${transactionNo} does not exist.`);
  if (entries.some((e) => e.reversed)) throw new FinanceError(`Transaction ${transactionNo} has already been reversed.`);
  const first = entries[0];
  const iso = opts.date ? (typeof opts.date === "string" ? opts.date : isoFromDay(opts.date)) : isoFromDay(first.postingDate);

  const newTx = await postTransaction(tx, {
    date: iso,
    documentType: "Reversal",
    documentNo: first.documentNo,
    sourceType: first.sourceType ?? undefined,
    sourceId: first.sourceId ?? undefined,
    description: opts.reason ?? `Reversal of transaction ${transactionNo}`,
    branchId: first.branchId,
    userId: opts.userId,
    lines: entries.map((e) => ({
      account: { id: e.accountId },
      debit: Number(e.credit),
      credit: Number(e.debit),
      contactId: e.contactId,
      dimensions: (e.dimensions ?? {}) as Record<string, string>,
    })),
  });
  await tx.glEntry.updateMany({ where: { transactionNo: { in: [transactionNo, newTx] } }, data: { reversed: true } });
  await tx.glEntry.updateMany({ where: { transactionNo: newTx }, data: { reversalOfTx: transactionNo } });
  return newTx;
}

/** Reverses the latest posting of a source document, if any. Returns the reversal transaction number or null. */
export async function reverseSource(tx: Tx, sourceType: string, sourceId: string, opts: { date?: string; userId?: string | null; reason?: string } = {}) {
  const txNo = await findPostedTransaction(tx, sourceType, sourceId);
  return txNo ? reverseTransaction(tx, txNo, opts) : null;
}
