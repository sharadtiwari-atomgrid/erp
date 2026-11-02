import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList, StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney, num } from "@/lib/format";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({ params }: PageProps<"/crm/customers/[id]">) {
  const user = await requireUser("customers");
  const { id } = await params;
  const customer = await db.customer.findUnique({
    where: { id },
    include: {
      salesOrders: { orderBy: { orderDate: "desc" }, take: 10 },
      invoices: { orderBy: { issueDate: "desc" }, take: 10 },
    },
  });
  if (!customer) notFound();

  const [billed, outstanding] = await Promise.all([
    db.invoice.aggregate({ where: { customerId: id, status: { not: "CANCELLED" } }, _sum: { total: true } }),
    db.invoice.findMany({
      where: { customerId: id, status: { in: ["ISSUED", "PARTIALLY_PAID"] } },
      select: { total: true, amountPaid: true },
    }),
  ]);
  const outstandingAmount = outstanding.reduce((s, i) => s + num(i.total) - num(i.amountPaid), 0);
  const creditLimit = num(customer.creditLimit);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {customer.name} <StatusBadge status={customer.isActive ? "ACTIVE" : "INACTIVE"} />
          </span>
        }
        description={customer.code}
        back={{ href: "/crm/customers", label: "Customers" }}
        actions={
          <>
            {can(user.role, "quotations", "edit") && (
              <ButtonLink href={`/sales/quotations/new?customerId=${id}`} variant="secondary">
                New quotation
              </ButtonLink>
            )}
            {can(user.role, "salesOrders", "edit") && (
              <ButtonLink href={`/sales/orders/new?customerId=${id}`} variant="secondary">
                New sales order
              </ButtonLink>
            )}
            {can(user.role, "customers", "edit") && <ButtonLink href={`/crm/customers/${id}/edit`}>Edit</ButtonLink>}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total billed" value={formatMoney(billed._sum.total)} />
        <StatCard
          label="Outstanding"
          value={formatMoney(outstandingAmount)}
          tone={creditLimit > 0 && outstandingAmount > creditLimit ? "danger" : "default"}
          hint={creditLimit > 0 ? `Credit limit ${formatMoney(creditLimit)}` : "No credit limit"}
        />
        <StatCard label="Payment terms" value={`${customer.paymentTermsDays} days`} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Details" />
          <CardBody>
            <DetailList
              items={[
                { label: "Email", value: customer.email },
                { label: "Phone", value: customer.phone },
                { label: "GSTIN", value: customer.gstin },
                { label: "State", value: customer.state },
                { label: "Billing address", value: [customer.billingAddress, customer.city, customer.pincode].filter(Boolean).join("\n") || null },
                { label: "Shipping address", value: customer.shippingAddress },
                { label: "Notes", value: customer.notes },
              ]}
            />
          </CardBody>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Recent sales orders" />
            <Table>
              <THead>
                <tr>
                  <TH>Number</TH>
                  <TH>Date</TH>
                  <TH>Status</TH>
                  <TH align="right">Total</TH>
                </tr>
              </THead>
              <TBody>
                {customer.salesOrders.length === 0 && <EmptyRow colSpan={4}>No sales orders yet.</EmptyRow>}
                {customer.salesOrders.map((o) => (
                  <TR key={o.id}>
                    <TD>
                      <Link href={`/sales/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">
                        {o.number}
                      </Link>
                    </TD>
                    <TD>{formatDate(o.orderDate)}</TD>
                    <TD>
                      <StatusBadge status={o.status} />
                    </TD>
                    <TD align="right">{formatMoney(o.total)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>

          <Card>
            <CardHeader title="Recent invoices" />
            <Table>
              <THead>
                <tr>
                  <TH>Number</TH>
                  <TH>Issued</TH>
                  <TH>Due</TH>
                  <TH>Status</TH>
                  <TH align="right">Total</TH>
                  <TH align="right">Balance</TH>
                </tr>
              </THead>
              <TBody>
                {customer.invoices.length === 0 && <EmptyRow colSpan={6}>No invoices yet.</EmptyRow>}
                {customer.invoices.map((inv) => (
                  <TR key={inv.id}>
                    <TD>
                      <Link href={`/sales/invoices/${inv.id}`} className="font-medium text-brand-700 hover:underline">
                        {inv.number}
                      </Link>
                    </TD>
                    <TD>{formatDate(inv.issueDate)}</TD>
                    <TD>{formatDate(inv.dueDate)}</TD>
                    <TD>
                      <StatusBadge status={inv.status} />
                    </TD>
                    <TD align="right">{formatMoney(inv.total)}</TD>
                    <TD align="right">{formatMoney(num(inv.total) - num(inv.amountPaid))}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>
      </div>
    </>
  );
}
