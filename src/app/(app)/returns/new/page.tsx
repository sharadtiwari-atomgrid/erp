import type { Metadata } from "next";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { branchWhere, getBranchScope } from "@/lib/branch";
import { db } from "@/lib/db";
import { param } from "@/lib/forms";
import { getCustomerOptions, getWarehouseOptions } from "@/lib/options";
import { loadReturnSource } from "../_lib/source";
import { createReturn } from "../actions";
import { ReturnForm } from "../return-form";

export const metadata: Metadata = { title: "New return" };

export default async function NewReturnPage({ searchParams }: PageProps<"/returns/new">) {
  await requireUser("returns", "edit");
  const sp = await searchParams;
  const invoiceId = param(sp, "invoiceId");
  const salesOrderId = param(sp, "salesOrderId");
  const customerId = param(sp, "customerId");
  const scope = await getBranchScope();

  const [source, customers, warehouses, products, invoices] = await Promise.all([
    loadReturnSource({ invoiceId: invoiceId || null, salesOrderId: invoiceId ? null : salesOrderId || null }),
    getCustomerOptions(),
    getWarehouseOptions({ branchId: scope.branchId }),
    db.product.findMany({ where: { isActive: true, type: "GOODS" }, orderBy: { name: "asc" }, select: { id: true, sku: true, name: true, unit: true } }),
    db.invoice.findMany({
      where: { ...(await branchWhere()), status: { in: ["ISSUED", "PARTIALLY_PAID", "PAID"] }, ...(customerId && { customerId }) },
      orderBy: { issueDate: "desc" },
      take: 100,
      select: { id: true, number: true, customer: { select: { name: true } } },
    }),
  ]);
  const backHref = source ? (source.kind === "invoice" ? `/sales/invoices/${source.id}` : `/sales/orders/${source.id}`) : "/returns";
  const missing = (invoiceId || salesOrderId) && !source;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="New return"
        description="Raise a return (RMA) for goods a customer is sending back."
        back={source ? { href: backHref, label: source.number } : { href: "/returns", label: "Returns" }}
      />
      {missing && (
        <div role="alert" className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          That invoice or sales order can’t be returned against (it may be a draft or cancelled). You can still raise a return manually.
        </div>
      )}
      {!source && (
        <Card className="mb-6">
          <CardBody>
            <form className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-ink-soft">Start from an invoice to copy its lines:</span>
              <Select name="invoiceId" defaultValue="" className="w-auto min-w-64" aria-label="Invoice" required>
                <option value="">Choose invoice…</option>
                {invoices.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.number} · {i.customer.name}
                  </option>
                ))}
              </Select>
              <button type="submit" className={buttonClass("secondary")}>
                Use invoice
              </button>
            </form>
          </CardBody>
        </Card>
      )}
      <ReturnForm
        key={source?.id ?? "manual"}
        action={createReturn}
        cancelHref={backHref}
        source={source}
        customers={customers.map((c) => ({ id: c.id, label: `${c.code} — ${c.name}` }))}
        warehouses={warehouses.map((w) => ({ id: w.id, label: `${w.code} — ${w.name}` }))}
        products={products}
        defaults={{
          customerId: source?.customerId ?? customerId,
          warehouseId: source?.warehouseId && warehouses.some((w) => w.id === source.warehouseId) ? source.warehouseId : (warehouses[0]?.id ?? ""),
        }}
      />
    </div>
  );
}
