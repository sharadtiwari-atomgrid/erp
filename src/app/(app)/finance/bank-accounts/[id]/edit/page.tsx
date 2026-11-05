import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { updateBankAccount } from "../../actions";
import { BankAccountForm } from "../../bank-account-form";

export const metadata: Metadata = { title: "Edit Bank Account" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function EditBankAccountPage({ params }: PageProps<"/finance/bank-accounts/[id]/edit">) {
  await requireUser("finance", "edit");
  await ensureFinanceSetup();
  const { id } = await params;
  const account = await db.bankAccount.findUnique({ where: { id }, include: { glAccount: { select: { code: true, name: true } } } });
  if (!account) notFound();
  return (
    <>
      <PageHeader title={`Edit ${account.name}`} back={{ href: `/finance/bank-accounts/${id}`, label: account.name }} />
      <BankAccountForm
        action={updateBankAccount.bind(null, id)}
        cancelHref={`/finance/bank-accounts/${id}`}
        glAccount={`${account.glAccount.code} ${account.glAccount.name}`}
        initial={{
          name: account.name,
          kind: account.kind,
          bankName: account.bankName,
          accountNo: account.accountNo,
          ifsc: account.ifsc,
          branchName: account.branchName,
          isActive: account.isActive,
        }}
      />
    </>
  );
}
