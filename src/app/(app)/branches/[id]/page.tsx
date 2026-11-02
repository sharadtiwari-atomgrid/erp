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
import { formatMoney, humanize } from "@/lib/format";
import { can } from "@/lib/permissions";

export const metadata: Metadata = { title: "Branch" };

export default async function BranchPage({ params }: PageProps<"/branches/[id]">) {
  const user = await requireUser("branches");
  const { id } = await params;
  const branch = await db.branch.findUnique({
    where: { id },
    include: {
      warehouses: { orderBy: { code: "asc" } },
      productionUnits: { orderBy: { code: "asc" }, include: { _count: { select: { machines: true } } } },
      teams: { orderBy: { name: "asc" }, include: { _count: { select: { members: true } } } },
      users: { orderBy: { name: "asc" }, select: { id: true, name: true, role: { select: { name: true } } } },
    },
  });
  if (!branch) notFound();

  const [openOrders, openPos, sales] = await Promise.all([
    db.salesOrder.count({ where: { branchId: id, status: { in: ["CONFIRMED", "PARTIALLY_DELIVERED"] } } }),
    db.purchaseOrder.count({ where: { branchId: id, status: { in: ["ORDERED", "PARTIALLY_RECEIVED"] } } }),
    db.invoice.aggregate({ where: { branchId: id, status: { notIn: ["DRAFT", "CANCELLED"] } }, _sum: { total: true } }),
  ]);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {branch.name} <StatusBadge status={branch.isActive ? "ACTIVE" : "INACTIVE"} />
          </span>
        }
        description={branch.code}
        back={{ href: "/branches", label: "Branches" }}
        actions={can(user, "branches", "edit") && <ButtonLink href={`/branches/${id}/edit`}>Edit</ButtonLink>}
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Invoiced to date" value={formatMoney(sales._sum.total)} />
        <StatCard label="Open sales orders" value={openOrders} />
        <StatCard label="Open purchase orders" value={openPos} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <DetailList
              items={[
                { label: "GSTIN", value: branch.gstin },
                { label: "Phone", value: branch.phone },
                { label: "Address", value: [branch.address, [branch.city, branch.state, branch.pincode].filter(Boolean).join(", ")].filter(Boolean).join("\n") || null },
              ]}
            />
          </CardBody>
        </Card>
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Warehouses" />
            <Table>
              <THead>
                <tr>
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {branch.warehouses.length === 0 && <EmptyRow colSpan={3}>No warehouses in this branch.</EmptyRow>}
                {branch.warehouses.map((w) => (
                  <TR key={w.id}>
                    <TD className="font-mono text-xs">{w.code}</TD>
                    <TD>
                      <Link href={`/inventory/warehouses/${w.id}`} className="font-medium text-brand-700 hover:underline">
                        {w.name}
                      </Link>
                    </TD>
                    <TD>
                      <StatusBadge status={w.isActive ? "ACTIVE" : "INACTIVE"} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Production units" />
            <Table>
              <THead>
                <tr>
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH align="right">Machines</TH>
                </tr>
              </THead>
              <TBody>
                {branch.productionUnits.length === 0 && <EmptyRow colSpan={3}>No production units in this branch.</EmptyRow>}
                {branch.productionUnits.map((u) => (
                  <TR key={u.id}>
                    <TD className="font-mono text-xs">{u.code}</TD>
                    <TD>{u.name}</TD>
                    <TD align="right">{u._count.machines}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Teams & people" />
            <CardBody className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {branch.teams.length === 0 && <p className="text-sm text-ink-faint">No teams yet.</p>}
                {branch.teams.map((t) => (
                  <Link key={t.id} href={`/teams/${t.id}`} className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-muted">
                    {t.name} <span className="text-xs text-ink-faint">· {humanize(t.type)} · {t._count.members}</span>
                  </Link>
                ))}
              </div>
              {branch.users.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">Restricted to this branch</p>
                  <div className="flex flex-wrap gap-2">
                    {branch.users.map((u) => (
                      <Badge key={u.id}>
                        {u.name} · {u.role.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
