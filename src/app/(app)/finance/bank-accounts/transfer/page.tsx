import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { getBankAccountOptions } from "@/lib/finance/queries";
import { param } from "@/lib/forms";
import { todayIso } from "@/lib/ops/dates";
import { glBalances } from "../../_cash_fa/server";
import { TransferForm } from "../transfer-form";

export const metadata: Metadata = { title: "Transfer between accounts" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function TransferPage({ searchParams }: PageProps<"/finance/bank-accounts/transfer">) {
  await requireUser("finance", "edit");
  await ensureFinanceSetup();
  const sp = await searchParams;
  const accounts = await getBankAccountOptions();
  const balances = await glBalances(accounts.map((a) => a.glAccountId));
  return (
    <>
      <PageHeader
        title="Transfer between accounts"
        description="Move money between bank and cash accounts (contra entry)."
        back={{ href: "/finance/bank-accounts", label: "Bank accounts" }}
      />
      <TransferForm
        accounts={accounts.map((a) => ({ id: a.id, code: a.code, name: a.name, balance: balances.get(a.glAccountId) ?? 0 }))}
        today={todayIso()}
        defaultFrom={param(sp, "from") || undefined}
      />
    </>
  );
}
