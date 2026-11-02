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
import { formatDate, formatMoney } from "@/lib/format";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Supplier" };

export default async function SupplierPage({ params }: PageProps<"/purchasing/suppliers/[id]">) {
  const user = await requireUser("suppliers");
  const { id } = await params;
  const supplier = await db.supplier.findUnique({
    where: { id },
    include: {
      purchaseOrders: { orderBy: { orderDate: "desc" }, take: 10, include: { warehouse: { select: { code: true } } } },
    },
  });
  if (!supplier) notFound();

  const [purchased, open] = await Promise.all([
    db.purchaseOrder.aggregate({ where: { supplierId: id, status: { notIn: ["DRAFT", "CANCELLED"] } }, _sum: { total: true }, _count: true }),
    db.purchaseOrder.aggregate({ where: { supplierId: id, status: { in: ["ORDERED", "PARTIALLY_RECEIVED"] } }, _sum: { total: true }, _count: true }),
  ]);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {supplier.name} <StatusBadge status={supplier.isActive ? "ACTIVE" : "INACTIVE"} />
          </span>
        }
        description={supplier.code}
        back={{ href: "/purchasing/suppliers", label: "Suppliers" }}
        actions={
          <>
            {can(user.role, "purchaseOrders", "edit") && supplier.isActive && (
              <ButtonLink href={`/purchasing/orders/new?supplierId=${id}`} variant="secondary">
                New purchase order
              </ButtonLink>
            )}
            {can(user.role, "suppliers", "edit") && <ButtonLink href={`/purchasing/suppliers/${id}/edit`}>Edit</ButtonLink>}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total purchased" value={formatMoney(purchased._sum.total)} hint={`${purchased._count} orders placed`} />
        <StatCard label="Open orders" value={formatMoney(open._sum.total)} hint={`${open._count} awaiting receipt`} tone={open._count > 0 ? "warning" : "default"} />
        <StatCard label="Payment terms" value={`${supplier.paymentTermsDays} days`} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Details" />
          <CardBody>
            <DetailList
              items={[
                { label: "Email", value: supplier.email },
                { label: "Phone", value: supplier.phone },
                { label: "GSTIN", value: supplier.gstin },
                { label: "State", value: supplier.state },
                { label: "Address", value: [supplier.address, supplier.city, supplier.pincode].filter(Boolean).join("\n") || null },
                { label: "Notes", value: supplier.notes },
              ]}
            />
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Recent purchase orders"
            actions={
              <Link href={`/purchasing/orders?q=${encodeURIComponent(supplier.name)}`} className="text-xs font-medium text-brand-700 hover:underline">
                View all
              </Link>
            }
          />
          <Table>
            <THead>
              <tr>
                <TH>Number</TH>
                <TH>Date</TH>
                <TH>Warehouse</TH>
                <TH>Status</TH>
                <TH align="right">Total</TH>
              </tr>
            </THead>
            <TBody>
              {supplier.purchaseOrders.length === 0 && <EmptyRow colSpan={5}>No purchase orders yet.</EmptyRow>}
              {supplier.purchaseOrders.map((o) => (
                <TR key={o.id}>
                  <TD>
                    <Link href={`/purchasing/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">
                      {o.number}
                    </Link>
                  </TD>
                  <TD>{formatDate(o.orderDate)}</TD>
                  <TD className="font-mono text-xs">{o.warehouse.code}</TD>
                  <TD>
                    <StatusBadge status={o.status} />
                  </TD>
                  <TD align="right">{formatMoney(o.total)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>
    </>
  );
}
