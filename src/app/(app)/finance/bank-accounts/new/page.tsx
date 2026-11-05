import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { createBankAccount } from "../actions";
import { BankAccountForm } from "../bank-account-form";

export const metadata: Metadata = { title: "New Bank Account" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function NewBankAccountPage() {
  await requireUser("finance", "edit");
  await ensureFinanceSetup();
  return (
    <>
      <PageHeader title="New Bank Account" back={{ href: "/finance/bank-accounts", label: "Bank Accounts" }} />
      <BankAccountForm action={createBankAccount} cancelHref="/finance/bank-accounts" />
    </>
  );
}
