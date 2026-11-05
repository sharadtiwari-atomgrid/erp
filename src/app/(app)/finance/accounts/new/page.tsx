import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { getCategories } from "../../_gl/accounts";
import { createAccount } from "../actions";
import { AccountForm } from "../account-form";

export const metadata: Metadata = { title: "New G/L Account" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function NewAccountPage() {
  await requireUser("finance", "edit");
  await ensureFinanceSetup();
  const [headings, categories] = await Promise.all([
    db.glAccount.findMany({ where: { isGroup: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, type: true } }),
    getCategories(),
  ]);
  return (
    <>
      <PageHeader title="New G/L Account" back={{ href: "/finance/accounts", label: "Chart of Accounts" }} />
      <AccountForm action={createAccount} headings={headings} categories={categories} cancelHref="/finance/accounts" />
    </>
  );
}
