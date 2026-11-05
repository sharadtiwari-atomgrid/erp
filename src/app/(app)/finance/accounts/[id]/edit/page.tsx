import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { getCategories } from "../../../_gl/accounts";
import { updateAccount } from "../../actions";
import { AccountForm } from "../../account-form";

export const metadata: Metadata = { title: "Edit G/L Account" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function EditAccountPage({ params }: PageProps<"/finance/accounts/[id]/edit">) {
  await requireUser("finance", "edit");
  await ensureFinanceSetup();
  const { id } = await params;
  const [account, headings, categories] = await Promise.all([
    db.glAccount.findUnique({ where: { id } }),
    db.glAccount.findMany({ where: { isGroup: true }, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, type: true } }),
    getCategories(),
  ]);
  if (!account) notFound();
  return (
    <>
      <PageHeader title={`Edit ${account.code} ${account.name}`} back={{ href: `/finance/accounts/${id}`, label: account.name }} />
      <AccountForm
        action={updateAccount.bind(null, id)}
        initial={account}
        headings={headings}
        categories={categories}
        cancelHref={`/finance/accounts/${id}`}
        selfId={id}
      />
    </>
  );
}
