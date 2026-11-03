import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList, StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatDateTime, formatMoney, num } from "@/lib/format";
import { param } from "@/lib/forms";
import { can } from "@/lib/permissions";
import { CONTACT_ROLE_LABELS, CONTACT_ROLE_TONES } from "../roles";

export const metadata: Metadata = { title: "Contact" };

export default async function ContactPage({ params, searchParams }: PageProps<"/contacts/[id]">) {
  const user = await requireUser("contacts");
  const { id } = await params;
  const renamed = param(await searchParams, "renamed");
  const customer = await db.contact.findUnique({
    where: { id },
    include: {
      salesOrders: { orderBy: { orderDate: "desc" }, take: 10 },
      invoices: { orderBy: { issueDate: "desc" }, take: 10 },
      purchaseOrders: { orderBy: { orderDate: "desc" }, take: 10 },
    },
  });
  if (!customer) notFound();

  const isCustomer = customer.roles.includes("CUSTOMER");
  const isSupplier = customer.roles.includes("SUPPLIER");

  const [billed, outstanding, purchased, history] = await Promise.all([
    db.invoice.aggregate({ where: { customerId: id, status: { not: "CANCELLED" } }, _sum: { total: true } }),
    db.invoice.findMany({
      where: { customerId: id, status: { in: ["ISSUED", "PARTIALLY_PAID"] } },
      select: { total: true, amountPaid: true },
    }),
    db.purchaseOrder.aggregate({ where: { supplierId: id, status: { not: "CANCELLED" } }, _sum: { total: true } }),
    db.activity.findMany({
      where: { entityType: "Contact", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { user: { select: { name: true } } },
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
            {customer.roles.map((r) => (
              <Badge key={r} tone={CONTACT_ROLE_TONES[r]}>
                {CONTACT_ROLE_LABELS[r]}
              </Badge>
            ))}
          </span>
        }
        description={customer.code}
        back={{ href: "/contacts", label: "Contacts" }}
        actions={
          <>
            {isSupplier && can(user, "purchaseOrders", "edit") && (
              <ButtonLink href={`/purchasing/orders/new?supplierId=${id}`} variant="secondary">
                New purchase order
              </ButtonLink>
            )}
            {isCustomer && can(user, "quotations", "edit") && (
              <ButtonLink href={`/sales/quotations/new?customerId=${id}`} variant="secondary">
                New quotation
              </ButtonLink>
            )}
            {isCustomer && can(user, "salesOrders", "edit") && (
              <ButtonLink href={`/sales/orders/new?customerId=${id}`} variant="secondary">
                New sales order
              </ButtonLink>
            )}
            {can(user, "contacts", "edit") && <ButtonLink href={`/contacts/${id}/edit`}>Edit</ButtonLink>}
          </>
        }
      />

      {renamed && (
        <div role="status" className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Contact renamed. {renamed}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {isSupplier && !isCustomer ? (
          <StatCard label="Total purchased" value={formatMoney(purchased._sum.total)} />
        ) : (
          <StatCard label="Total billed" value={formatMoney(billed._sum.total)} />
        )}
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
                { label: "Contact person", value: customer.contactPerson },
                { label: "Email", value: customer.email },
                { label: "Phone", value: customer.phone },
                { label: customer.roles.includes("TRANSPORTER") ? "Transporter ID (GSTIN)" : "GSTIN", value: customer.gstin },
                { label: "POC names", value: customer.pocNames.length ? customer.pocNames.join("\n") : null },
                { label: "Multiple addresses", value: customer.multipleAddresses ? "Yes: delivers to more than one address" : "No" },
                { label: "PAN", value: customer.pan },
                { label: "State", value: customer.state },
                { label: "Billing address", value: [customer.billingAddress, customer.city, customer.pincode].filter(Boolean).join("\n") || null },
                { label: "Shipping address", value: customer.shippingAddress },
                { label: "Notes", value: customer.notes },
              ]}
            />
          </CardBody>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          {isSupplier && (
            <Card>
              <CardHeader title="Recent purchase orders" description={`Total purchased ${formatMoney(purchased._sum.total)}`} />
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
                  {customer.purchaseOrders.length === 0 && <EmptyRow colSpan={4}>No purchase orders yet.</EmptyRow>}
                  {customer.purchaseOrders.map((o) => (
                    <TR key={o.id}>
                      <TD>
                        <Link href={`/purchasing/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">
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
          )}

          {isCustomer && (
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

          )}

          {isCustomer && (
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
          )}

          <Card>
            <CardHeader title="History" />
            <CardBody>
              {history.length === 0 ? (
                <p className="text-sm text-ink-faint">No changes recorded yet.</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {history.map((a) => {
                    const changes = (a.changes ?? {}) as Record<string, [unknown, unknown]>;
                    return (
                      <li key={a.id}>
                        <div className="text-ink">{a.message}</div>
                        <div className="text-xs text-ink-faint">
                          {a.user?.name ?? "System"} · {formatDateTime(a.createdAt)}
                        </div>
                        {Object.keys(changes).length > 0 && (
                          <ul className="mt-1 space-y-0.5 text-xs text-ink-soft">
                            {Object.entries(changes).map(([field, [from, to]]) => (
                              <li key={field}>
                                <span className="font-medium">{field}</span>: {String(from ?? "—") || "—"} → {String(to ?? "—") || "—"}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
