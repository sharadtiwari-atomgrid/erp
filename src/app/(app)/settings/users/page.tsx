import Link from "next/link";
import type { Metadata } from "next";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  await requireUser("settings");
  const users = await db.user.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: { role: { select: { name: true, fullAccess: true } }, branch: { select: { code: true } } },
  });

  return (
    <>
      <PageHeader
        title="Users"
        description="Who can sign in, their role and which branch they work in."
        actions={
          <>
            <ButtonLink href="/settings/roles" variant="secondary">
              Roles & access
            </ButtonLink>
            <ButtonLink href="/settings/users/new">Add user</ButtonLink>
          </>
        }
      />
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Email</TH>
              <TH>Role</TH>
              <TH>Branch</TH>
              <TH>Status</TH>
              <TH>Added</TH>
            </tr>
          </THead>
          <TBody>
            {users.map((u) => (
              <TR key={u.id}>
                <TD>
                  <Link href={`/settings/users/${u.id}`} className="font-medium text-brand-700 hover:underline">
                    {u.name}
                  </Link>
                </TD>
                <TD className="text-ink-soft">{u.email}</TD>
                <TD>
                  <Badge tone={u.role.fullAccess ? "violet" : "gray"}>{u.role.name}</Badge>
                </TD>
                <TD className="text-ink-soft">{u.branch?.code ?? "All"}</TD>
                <TD>
                  <StatusBadge status={u.isActive ? "ACTIVE" : "INACTIVE"} />
                </TD>
                <TD className="text-ink-soft">{formatDate(u.createdAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
