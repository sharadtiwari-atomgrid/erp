import Link from "next/link";
import type { Metadata } from "next";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Branches" };

export default async function BranchesPage() {
  const user = await requireUser("branches");
  const branches = await db.branch.findMany({
    orderBy: { code: "asc" },
    include: { _count: { select: { warehouses: true, teams: true, users: true, productionUnits: true } } },
  });

  return (
    <>
      <PageHeader
        title="Branches"
        description="Manage data across multiple branches. Pick a branch in the header to focus every list on it."
        actions={can(user, "branches", "edit") && <ButtonLink href="/branches/new">New branch</ButtonLink>}
      />
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Code</TH>
              <TH>Name</TH>
              <TH>Location</TH>
              <TH>GSTIN</TH>
              <TH align="right">Warehouses</TH>
              <TH align="right">Factories</TH>
              <TH align="right">Teams</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {branches.length === 0 && <EmptyRow colSpan={8}>No branches yet.</EmptyRow>}
            {branches.map((b) => (
              <TR key={b.id}>
                <TD className="font-mono text-xs">{b.code}</TD>
                <TD>
                  <Link href={`/branches/${b.id}`} className="font-medium text-brand-700 hover:underline">
                    {b.name}
                  </Link>
                </TD>
                <TD className="text-ink-soft">{[b.city, b.state].filter(Boolean).join(", ") || "—"}</TD>
                <TD className="font-mono text-xs">{b.gstin ?? "—"}</TD>
                <TD align="right">{b._count.warehouses}</TD>
                <TD align="right">{b._count.productionUnits}</TD>
                <TD align="right">{b._count.teams}</TD>
                <TD>
                  <StatusBadge status={b.isActive ? "ACTIVE" : "INACTIVE"} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
