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
import { MODULES, ROLE_LABELS } from "@/lib/permissions";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  await requireUser("settings");
  const users = await db.user.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] });

  return (
    <>
      <PageHeader title="Users" description="Who can sign in, and what each role can do." actions={<ButtonLink href="/settings/users/new">Add user</ButtonLink>} />
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Email</TH>
              <TH>Role</TH>
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
                  <Badge tone={u.role === "ADMIN" ? "violet" : "gray"}>{ROLE_LABELS[u.role]}</Badge>
                </TD>
                <TD>
                  <StatusBadge status={u.isActive ? "ACTIVE" : "INACTIVE"} />
                </TD>
                <TD className="text-ink-soft">{formatDate(u.createdAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-ink">Role permissions</h2>
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Module</TH>
              {Object.keys(ROLE_LABELS)
                .filter((r) => r !== "ADMIN")
                .map((r) => (
                  <TH key={r} align="center">
                    {ROLE_LABELS[r as keyof typeof ROLE_LABELS]}
                  </TH>
                ))}
            </tr>
          </THead>
          <TBody>
            {Object.entries(MODULES)
              .filter(([m]) => m !== "settings" && m !== "dashboard")
              .map(([module, rule]) => (
                <TR key={module}>
                  <TD className="font-medium">{module.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())}</TD>
                  {(["MANAGER", "SALES", "PURCHASE", "WAREHOUSE", "VIEWER"] as const).map((role) => {
                    const edit = (rule.edit as readonly string[]).includes(role);
                    const view = rule.view === "all" || (rule.view as readonly string[]).includes(role);
                    return (
                      <TD key={role} align="center" className="text-xs">
                        {edit ? <Badge tone="green">Edit</Badge> : view ? <Badge tone="blue">View</Badge> : <span className="text-ink-faint">—</span>}
                      </TD>
                    );
                  })}
                </TR>
              ))}
          </TBody>
        </Table>
        <p className="border-t border-line px-4 py-3 text-xs text-ink-faint">Administrators have full access to every module, including settings.</p>
      </Card>
    </>
  );
}
