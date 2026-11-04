"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { diff, recordChange } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db, type Tx } from "@/lib/db";
import { postTransaction } from "@/lib/finance/posting";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { formatMoney } from "@/lib/format";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { attempt, CashFaError } from "../_cash_fa/server";

const accountSchema = z.object({
  name: f.text("Name"),
  kind: z.enum(["BANK", "CASH"], { error: "Choose bank or cash" }),
  bankName: f.optionalText(),
  accountNo: f.optionalText(),
  ifsc: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v), "IFSC is 11 characters, e.g. ABCD0123456"),
  branchName: f.optionalText(),
  isActive: f.checkbox(),
});

/**
 * Next free ledger code under a heading: bank accounts under 1440 from 1442,
 * cash accounts from 1431 (1430 is cash in hand).
 */
async function nextGlCode(tx: Tx, kind: "BANK" | "CASH") {
  const [first, last] = kind === "BANK" ? [1442, 1449] : [1431, 1439];
  const used = new Set((await tx.glAccount.findMany({ where: { code: { gte: String(first), lte: String(last) } }, select: { code: true } })).map((a) => a.code));
  for (let c = first; c <= last; c++) if (!used.has(String(c))) return String(c);
  // Range full: continue with a sub-code, e.g. 1440-10.
  const parent = kind === "BANK" ? "1440" : "1430";
  for (let i = 10; i < 1000; i++) {
    const code = `${parent}-${i}`;
    if (!(await tx.glAccount.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
  throw new CashFaError("No free ledger code is left for a new account.");
}

async function nextBankCode(tx: Tx, kind: "BANK" | "CASH") {
  const prefix = kind === "BANK" ? "BANK-" : "CASH-";
  const count = await tx.bankAccount.count({ where: { code: { startsWith: prefix } } });
  for (let i = count + 1; i < count + 1000; i++) {
    const code = `${prefix}${String(i).padStart(2, "0")}`;
    if (!(await tx.bankAccount.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
  throw new CashFaError("Could not find a free bank account code.");
}

export async function createBankAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const parsed = parseForm(accountSchema, formData);
  if (!parsed.ok) return parsed.state;
  const data = parsed.data;
  await ensureFinanceSetup();

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const parentCode = data.kind === "BANK" ? "1440" : "1400";
      const parent = await tx.glAccount.findUnique({ where: { code: parentCode } });
      if (!parent) throw new CashFaError(`Ledger heading ${parentCode} is missing from the chart of accounts.`);
      const glCode = await nextGlCode(tx, data.kind);
      const gl = await tx.glAccount.create({
        data: {
          code: glCode,
          name: data.name,
          type: "ASSET",
          category: "Cash & cash equivalents",
          parentId: parent.id,
          cashFlowGroup: "CASH",
          directPosting: true,
          description: [data.bankName, data.accountNo].filter(Boolean).join(" · ") || null,
        },
      });
      const code = await nextBankCode(tx, data.kind);
      const created = await tx.bankAccount.create({ data: { ...data, code, glAccountId: gl.id } });
      await recordChange(
        { userId: user.id, entityType: "BankAccount", entityId: created.id, action: "created", message: `Bank account ${code} ${data.name} created with ledger account ${glCode}` },
        tx,
      );
      return created;
    }),
  );
  if (!result.ok) return { error: result.error };
  revalidatePath("/finance/bank-accounts");
  redirect(`/finance/bank-accounts/${result.value.id}`);
}

export async function updateBankAccount(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const parsed = parseForm(accountSchema, formData);
  if (!parsed.ok) return parsed.state;
  const before = await db.bankAccount.findUnique({ where: { id } });
  if (!before) return { error: "This bank account no longer exists." };
  // The kind decides where the ledger account sits, so it stays as created.
  const { kind: _kind, ...data } = parsed.data;
  void _kind;

  await db.$transaction(async (tx) => {
    const after = await tx.bankAccount.update({ where: { id }, data });
    await tx.glAccount.update({
      where: { id: before.glAccountId },
      data: { name: data.name, description: [data.bankName, data.accountNo].filter(Boolean).join(" · ") || null },
    });
    await recordChange(
      { userId: user.id, entityType: "BankAccount", entityId: id, action: "updated", message: `Bank account ${after.code} updated`, changes: diff(before, after) },
      tx,
    );
  });
  revalidatePath("/finance/bank-accounts");
  revalidatePath(`/finance/bank-accounts/${id}`);
  redirect(`/finance/bank-accounts/${id}`);
}

const transferSchema = z.object({
  fromId: f.id("From account"),
  toId: f.id("To account"),
  date: z.iso.date("Enter a valid date"),
  amount: f.number({ min: 0.01, label: "Amount" }),
  reference: f.optionalText(),
  narration: f.optionalText(),
});

/** Contra entry between two bank / cash accounts: Dr destination / Cr source. */
export async function transferFunds(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const parsed = parseForm(transferSchema, formData);
  if (!parsed.ok) return parsed.state;
  const t = parsed.data;
  if (t.fromId === t.toId) return { error: "Choose two different accounts.", fieldErrors: { toId: ["Must differ from the source account"] } };
  const [from, to] = await Promise.all([db.bankAccount.findUnique({ where: { id: t.fromId } }), db.bankAccount.findUnique({ where: { id: t.toId } })]);
  if (!from || !to) return { error: "Choose both accounts." };

  const result = await attempt(() =>
    db.$transaction(async (tx) => {
      const description = t.narration ?? `Transfer from ${from.name} to ${to.name}`;
      const transactionNo = await postTransaction(tx, {
        date: t.date,
        documentType: "Bank transfer",
        documentNo: t.reference,
        sourceType: "BankAccount",
        sourceId: from.id,
        description,
        userId: user.id,
        lines: [
          { account: { id: to.glAccountId }, debit: t.amount },
          { account: { id: from.glAccountId }, credit: t.amount },
        ],
      });
      await recordChange(
        { userId: user.id, entityType: "BankAccount", entityId: from.id, action: "posted", message: `Transfer of ${formatMoney(t.amount)} to ${to.name} posted (transaction ${transactionNo})` },
        tx,
      );
      return transactionNo;
    }),
  );
  if (!result.ok) return { error: result.error };
  revalidatePath("/finance", "layout");
  redirect(`/finance/bank-accounts/${from.id}?posted=${result.value}`);
}
