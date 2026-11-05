import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getBankAccountOptions, openReceivables } from "@/lib/finance/queries";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { num } from "@/lib/format";
import { param } from "@/lib/forms";
import { todayIso } from "@/lib/ops/dates";
import { getCustomerOptions } from "@/lib/options";
import { istDay } from "../../_ar_ap/aging";
import { createReceipt } from "../actions";
import { ReceiptForm } from "../receipt-form";

export const metadata: Metadata = { title: "New Cash Receipt" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function NewReceiptPage({ searchParams }: PageProps<"/finance/receipts/new">) {
  await requireUser("finance", "edit");
  await ensureFinanceSetup();
  const sp = await searchParams;
  const [customers, bankAccounts, open] = await Promise.all([getCustomerOptions(), getBankAccountOptions(), openReceivables()]);

  return (
    <div className="max-w-6xl">
      <PageHeader title="New Cash Receipt" back={{ href: "/finance/receipts", label: "Cash Receipt Journals" }} />
      <ReceiptForm
        action={createReceipt}
        customers={customers.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
        bankAccounts={bankAccounts}
        invoices={open.map((i) => ({
          id: i.id,
          number: i.number,
          customerId: i.customerId,
          docDate: istDay(i.issueDate),
          dueDate: i.dueDate ? istDay(i.dueDate) : null,
          total: num(i.total),
          balance: Math.round(i.balance * 100) / 100,
        }))}
        today={todayIso()}
        defaultCustomerId={param(sp, "customerId") || undefined}
      />
    </div>
  );
}
