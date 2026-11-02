import Link from "next/link";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parsePermissions } from "@/lib/permissions";

export const metadata: Metadata = { title: "Roles & access" };

export default async function RolesPage() {
  await requireUser("settings");
  const roles = await db.accessRole.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { users: true } } } });

  return (
    <>
      <PageHeader
        title="Roles & access"
        description="Role-based access control: decide which modules each team member can see and change."
        actions={<ButtonLink href="/settings/roles/new">New role</ButtonLink>}
      />
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Role</TH>
              <TH>Description</TH>
              <TH align="right">Modules editable</TH>
              <TH align="right">Modules viewable</TH>
              <TH align="right">Users</TH>
            </tr>
          </THead>
          <TBody>
            {roles.map((r) => {
              const levels = Object.values(parsePermissions(r.permissions));
              return (
                <TR key={r.id}>
                  <TD>
                    <Link href={`/settings/roles/${r.id}`} className="font-medium text-brand-700 hover:underline">
                      {r.name}
                    </Link>
                    {r.fullAccess && (
                      <span className="ml-2">
                        <Badge tone="violet">Full access</Badge>
                      </span>
                    )}
                  </TD>
                  <TD className="text-ink-soft">{r.description}</TD>
                  <TD align="right">{r.fullAccess ? "All" : levels.filter((l) => l === "edit").length}</TD>
                  <TD align="right">{r.fullAccess ? "All" : levels.filter((l) => l !== "none").length}</TD>
                  <TD align="right">{r._count.users}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
