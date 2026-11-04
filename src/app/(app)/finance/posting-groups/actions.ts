"use server";

import { revalidatePath } from "next/cache";
import { recordChange } from "@/lib/audit";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { POSTING_KEYS } from "@/lib/finance/chart";
import type { ActionState } from "@/lib/forms";

export async function setPostingAccount(key: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("finance", "edit");
  if (!(key in POSTING_KEYS)) return { error: "Unknown posting key." };
  const accountId = String(formData.get("accountId") ?? "");
  if (!accountId) return { error: "Choose an account." };
  const account = await db.glAccount.findUnique({ where: { id: accountId } });
  if (!account) return { error: "That account no longer exists." };
  if (account.isGroup) return { error: `${account.code} ${account.name} is a heading; choose an account under it.` };
  if (!account.isActive) return { error: `${account.code} ${account.name} is blocked.` };
  const before = await db.postingAccount.findUnique({ where: { key }, include: { account: { select: { code: true } } } });
  if (before?.accountId === accountId) return { success: "No change." };
  await db.$transaction(async (tx) => {
    await tx.postingAccount.upsert({ where: { key }, create: { key, accountId }, update: { accountId } });
    await recordChange(
      { userId: user.id, entityType: "PostingAccount", entityId: key, action: "updated", message: `Posting key ${key} mapped to ${account.code} ${account.name}`, changes: { account: [before?.account.code ?? "", account.code] } },
      tx,
    );
  });
  revalidatePath("/finance/posting-groups");
  return { success: `Now posts to ${account.code}.` };
}
