"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { GlAccountType } from "@/generated/prisma/enums";
import { diff, recordChange } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { f, parseForm, type ActionState } from "@/lib/forms";
import { CASH_FLOW_GROUPS } from "../_gl/ledger";

const accountSchema = z.object({
  code: f.text("Code").pipe(z.string().max(20, "Code is too long").regex(/^[A-Za-z0-9.\-]+$/, "Use letters, digits, dots or dashes")),
  name: f.text("Name"),
  type: z.enum(GlAccountType, { error: "Choose a type" }),
  category: f.text("Category"),
  parentId: f.optionalText(),
  isGroup: f.checkbox(),
  cashFlowGroup: z.enum(CASH_FLOW_GROUPS, { error: "Choose a cash flow group" }),
  directPosting: f.checkbox(),
  isActive: f.checkbox(),
  description: f.optionalText(),
});

type AccountData = z.infer<typeof accountSchema>;

async function checkAccount(data: AccountData, id?: string): Promise<ActionState | null> {
  const clash = await db.glAccount.findUnique({ where: { code: data.code }, select: { id: true } });
  if (clash && clash.id !== id) return { error: "Please fix the highlighted fields.", fieldErrors: { code: ["Another account already uses this code"] } };
  if (data.parentId) {
    if (data.parentId === id) return { fieldErrors: { parentId: ["An account cannot be its own heading"] }, error: "Please fix the highlighted fields." };
    const parent = await db.glAccount.findUnique({ where: { id: data.parentId }, select: { isGroup: true, type: true, parentId: true } });
    if (!parent?.isGroup) return { fieldErrors: { parentId: ["Choose a heading account"] }, error: "Please fix the highlighted fields." };
    if (parent.type !== data.type) return { fieldErrors: { parentId: ["The heading must be of the same type"] }, error: "Please fix the highlighted fields." };
    // No cycles: walk up from the parent.
    let cur: string | null = parent.parentId;
    for (let guard = 0; cur && guard < 50; guard++) {
      if (cur === id) return { fieldErrors: { parentId: ["That heading sits under this account"] }, error: "Please fix the highlighted fields." };
      cur = (await db.glAccount.findUnique({ where: { id: cur }, select: { parentId: true } }))?.parentId ?? null;
    }
  }
  if (id && data.isGroup) {
    const posted = await db.glEntry.count({ where: { accountId: id } });
    if (posted) return { fieldErrors: { isGroup: ["This account has entries, so it can't become a heading"] }, error: "Please fix the highlighted fields." };
  }
  return null;
}

export async function createAccount(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  await ensureFinanceSetup();
  const parsed = parseForm(accountSchema, formData);
  if (!parsed.ok) return parsed.state;
  const data = { ...parsed.data, directPosting: parsed.data.isGroup ? false : parsed.data.directPosting };
  const problem = await checkAccount(data);
  if (problem) return problem;

  const account = await db.$transaction(async (tx) => {
    const created = await tx.glAccount.create({ data });
    await recordChange({ userId: user.id, entityType: "GlAccount", entityId: created.id, action: "created", message: `Account ${created.code} ${created.name} created` }, tx);
    return created;
  });
  revalidatePath("/finance/accounts");
  redirect(`/finance/accounts/${account.id}`);
}

export async function updateAccount(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const parsed = parseForm(accountSchema, formData);
  if (!parsed.ok) return parsed.state;
  const before = await db.glAccount.findUnique({ where: { id } });
  if (!before) return { error: "This account no longer exists." };
  const data = { ...parsed.data, directPosting: parsed.data.isGroup ? false : parsed.data.directPosting };
  if (before.isSystem && data.type !== before.type) return { error: "The type of a system account can't be changed.", fieldErrors: { type: ["Fixed for system accounts"] } };
  const problem = await checkAccount(data, id);
  if (problem) return problem;
  if (!data.isActive && before.isActive) {
    const mapped = await db.postingAccount.findFirst({ where: { accountId: id } });
    if (mapped) return { error: `This account is used by the ${mapped.key} posting key. Map that key to another account before blocking it.` };
  }

  await db.$transaction(async (tx) => {
    const after = await tx.glAccount.update({ where: { id }, data });
    await recordChange({ userId: user.id, entityType: "GlAccount", entityId: id, action: "updated", message: `Account ${after.code} ${after.name} updated`, changes: diff(before, after) }, tx);
  });
  revalidatePath("/finance/accounts");
  revalidatePath(`/finance/accounts/${id}`);
  redirect(`/finance/accounts/${id}`);
}

/** Block or unblock an account (accounts with entries are blocked instead of deleted). */
export async function setAccountBlocked(id: string, blocked: boolean): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const account = await db.glAccount.findUnique({ where: { id } });
  if (!account) return { error: "This account no longer exists." };
  if (blocked) {
    const mapped = await db.postingAccount.findFirst({ where: { accountId: id } });
    if (mapped) return { error: `Used by the ${mapped.key} posting key. Map that key to another account first.` };
  }
  await db.$transaction(async (tx) => {
    await tx.glAccount.update({ where: { id }, data: { isActive: !blocked } });
    await recordChange({ userId: user.id, entityType: "GlAccount", entityId: id, action: blocked ? "blocked" : "unblocked", message: `Account ${account.code} ${blocked ? "blocked" : "unblocked"}` }, tx);
  });
  revalidatePath("/finance/accounts");
  revalidatePath(`/finance/accounts/${id}`);
  return { success: blocked ? "Account blocked." : "Account unblocked." };
}

export async function deleteAccount(id: string): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  const account = await db.glAccount.findUnique({
    where: { id },
    include: { _count: { select: { entries: true, journalLines: true, budgetLines: true, bankAccounts: true, postingAccounts: true, children: true, purchaseInvoiceLines: true } } },
  });
  if (!account) return { error: "This account no longer exists." };
  if (account.isSystem) return { error: "System accounts can't be deleted. Block it instead." };
  const c = account._count;
  if (c.entries) return { error: "This account has ledger entries, so it can only be blocked." };
  if (c.children) return { error: "Move or delete the accounts under this heading first." };
  if (c.postingAccounts) return { error: "This account is used in posting setup. Map those keys elsewhere first." };
  if (c.journalLines || c.budgetLines || c.bankAccounts || c.purchaseInvoiceLines) return { error: "This account is used on journals, budgets, bank accounts or bills, so it can only be blocked." };
  await db.$transaction(async (tx) => {
    await tx.glAccount.delete({ where: { id } });
    await recordChange({ userId: user.id, entityType: "GlAccount", entityId: id, action: "deleted", message: `Account ${account.code} ${account.name} deleted` }, tx);
  });
  revalidatePath("/finance/accounts");
  redirect("/finance/accounts");
}
