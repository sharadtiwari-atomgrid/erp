import Link from "next/link";
import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListToolbar, Pagination } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { pagination, param } from "@/lib/forms";
import { can } from "@/lib/permissions";
import type { Prisma } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: PageProps<"/crm/customers">) {
  const user = await requireUser("customers");
  const sp = await searchParams;
  const q = param(sp, "q");
  const status = param(sp, "status");
  const { page, take, skip } = pagination(sp);

  const where: Prisma.CustomerWhereInput = {
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { gstin: { contains: q, mode: "insensitive" } },
      ],
    }),
    ...(status === "ACTIVE" && { isActive: true }),
    ...(status === "INACTIVE" && { isActive: false }),
  };

  const [customers, total] = await Promise.all([
    db.customer.findMany({ where, orderBy: { name: "asc" }, take, skip }),
    db.customer.count({ where }),
  ]);

  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone you sell to."
        actions={can(user.role, "customers", "edit") && <ButtonLink href="/crm/customers/new">New customer</ButtonLink>}
      />
      <Card>
        <ListToolbar
          q={q}
          placeholder="Search name, code, email, phone, GSTIN"
          filter={{
            name: "status",
            value: status,
            allLabel: "All customers",
            options: [
              { value: "ACTIVE", label: "Active" },
              { value: "INACTIVE", label: "Inactive" },
            ],
          }}
        />
        <Table>
          <THead>
            <tr>
              <TH>Code</TH>
              <TH>Name</TH>
              <TH>Contact</TH>
              <TH>City / State</TH>
              <TH>GSTIN</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {customers.length === 0 && <EmptyRow colSpan={6} />}
            {customers.map((c) => (
              <TR key={c.id}>
                <TD className="font-mono text-xs text-ink-soft">{c.code}</TD>
                <TD>
                  <Link href={`/crm/customers/${c.id}`} className="font-medium text-brand-700 hover:underline">
                    {c.name}
                  </Link>
                </TD>
                <TD className="text-ink-soft">
                  <div>{c.email ?? "—"}</div>
                  <div className="text-xs">{c.phone}</div>
                </TD>
                <TD className="text-ink-soft">{[c.city, c.state].filter(Boolean).join(", ") || "—"}</TD>
                <TD className="font-mono text-xs">{c.gstin ?? "—"}</TD>
                <TD>
                  <StatusBadge status={c.isActive ? "ACTIVE" : "INACTIVE"} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <Pagination page={page} pageSize={take} total={total} searchParams={sp} />
      </Card>
    </>
  );
}
