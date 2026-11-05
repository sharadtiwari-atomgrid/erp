import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { money } from "@/lib/finance/chart";
import { getBankAccountOptions } from "@/lib/finance/queries";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { num } from "@/lib/format";
import { param } from "@/lib/forms";
import { isoFromDay, todayIso } from "@/lib/ops/dates";
import { getPayeeOptions } from "../../_ar_ap/options";
import { createVendorPayment } from "../actions";
import { VendorPaymentForm } from "../payment-form";

export const metadata: Metadata = { title: "New Vendor Payment" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function NewVendorPaymentPage({ searchParams }: PageProps<"/finance/vendor-payments/new">) {
  await requireUser("finance", "edit");
  await ensureFinanceSetup();
  const sp = await searchParams;
  const supplierId = param(sp, "supplierId");
  const [suppliers, bankAccounts, bills, sections] = await Promise.all([
    getPayeeOptions(supplierId),
    getBankAccountOptions(),
    db.purchaseInvoice.findMany({
      where: { status: { in: ["POSTED", "PARTIALLY_PAID"] } },
      orderBy: { dueDate: "asc" },
      select: { id: true, number: true, supplierInvoiceNo: true, supplierId: true, invoiceDate: true, dueDate: true, subtotal: true, total: true, amountPaid: true },
    }),
    db.tdsSection.findMany({ where: { kind: "TDS", isActive: true }, orderBy: { code: "asc" } }),
  ]);

  return (
    <div className="max-w-6xl">
      <PageHeader title="New Vendor Payment" back={{ href: "/finance/vendor-payments", label: "Payment Journals" }} />
      <VendorPaymentForm
        action={createVendorPayment}
        suppliers={suppliers.map((s) => ({ id: s.id, code: s.code, name: s.name, pan: s.pan, gstin: s.gstin, transporter: s.transporter }))}
        bankAccounts={bankAccounts}
        bills={bills
          .map((b) => ({
            id: b.id,
            number: b.number,
            reference: b.supplierInvoiceNo,
            supplierId: b.supplierId,
            docDate: isoFromDay(b.invoiceDate),
            dueDate: b.dueDate ? isoFromDay(b.dueDate) : null,
            subtotal: num(b.subtotal),
            total: num(b.total),
            balance: money(num(b.total) - num(b.amountPaid)),
          }))
          .filter((b) => b.balance > 0.004)}
        sections={sections.map((s) => ({ id: s.id, code: s.code, description: s.description, rateIndividual: num(s.rateIndividual), rateCompany: num(s.rateCompany) }))}
        today={todayIso()}
        defaultSupplierId={supplierId || undefined}
        defaultBillId={param(sp, "billId") || undefined}
      />
    </div>
  );
}
