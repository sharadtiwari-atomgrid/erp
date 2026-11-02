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

export const metadata: Metadata = { title: "Suppliers" };

export default async function SuppliersPage({ searchParams }: PageProps<"/purchasing/suppliers">) {
  const user = await requireUser("suppliers");
  const sp = await searchParams;
  const q = param(sp, "q");
  const status = param(sp, "status");
  const { page, take, skip } = pagination(sp);

  const where: Prisma.SupplierWhereInput = {
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

  const [suppliers, total] = await Promise.all([
    db.supplier.findMany({ where, orderBy: { name: "asc" }, take, skip }),
    db.supplier.count({ where }),
  ]);

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Everyone you buy from."
        actions={can(user.role, "suppliers", "edit") && <ButtonLink href="/purchasing/suppliers/new">New supplier</ButtonLink>}
      />
      <Card>
        <ListToolbar
          q={q}
          placeholder="Search name, code, email, phone, GSTIN"
          filter={{
            name: "status",
            value: status,
            allLabel: "All suppliers",
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
            {suppliers.length === 0 && <EmptyRow colSpan={6} />}
            {suppliers.map((s) => (
              <TR key={s.id}>
                <TD className="font-mono text-xs text-ink-soft">{s.code}</TD>
                <TD>
                  <Link href={`/purchasing/suppliers/${s.id}`} className="font-medium text-brand-700 hover:underline">
                    {s.name}
                  </Link>
                </TD>
                <TD className="text-ink-soft">
                  <div>{s.email ?? "—"}</div>
                  <div className="text-xs">{s.phone}</div>
                </TD>
                <TD className="text-ink-soft">{[s.city, s.state].filter(Boolean).join(", ") || "—"}</TD>
                <TD className="font-mono text-xs">{s.gstin ?? "—"}</TD>
                <TD>
                  <StatusBadge status={s.isActive ? "ACTIVE" : "INACTIVE"} />
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
