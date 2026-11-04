import "server-only";
import type { GlAccountType } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { accountTotals } from "@/lib/finance/queries";
import { ACCOUNT_TYPES, buildAccountTree, filterTree } from "./ledger";

export type AccountTreeFilter = { asOf: string; type?: string; showBlocked?: boolean; q?: string };

/** Chart of accounts as an indented tree with balances as on a date (headings roll up their children). */
export async function loadAccountTree(f: AccountTreeFilter) {
  const type = ACCOUNT_TYPES.includes(f.type as GlAccountType) ? (f.type as GlAccountType) : undefined;
  const [accounts, totals] = await Promise.all([
    db.glAccount.findMany({
      where: type ? { type } : {},
      select: {
        id: true, code: true, name: true, type: true, category: true, parentId: true, isGroup: true,
        isActive: true, isSystem: true, directPosting: true, cashFlowGroup: true,
      },
    }),
    accountTotals({ to: f.asOf }),
  ]);
  let rows = buildAccountTree(accounts, totals);
  const q = f.q?.trim().toLowerCase();
  if (!f.showBlocked || q) {
    rows = filterTree(rows, (r) =>
      (f.showBlocked || r.isActive) &&
      (!q || r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q)),
    );
  }
  return rows;
}

/** Existing Schedule III categories, for the category picker. */
export async function getCategories(): Promise<string[]> {
  const rows = await db.glAccount.findMany({ distinct: ["category"], select: { category: true }, orderBy: { category: "asc" } });
  return rows.map((r) => r.category);
}
