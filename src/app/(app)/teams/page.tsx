import Link from "next/link";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { branchWhere } from "@/lib/branch";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { TEAM_TYPE_LABELS } from "./labels";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Teams" };

export default async function TeamsPage() {
  const user = await requireUser("teams");
  const branches = await db.branch.findMany({
    where: { id: (await branchWhere()).branchId },
    orderBy: { code: "asc" },
    include: {
      teams: {
        orderBy: { name: "asc" },
        include: { lead: { select: { name: true } }, members: { include: { user: { select: { name: true, role: { select: { name: true } } } } } } },
      },
    },
  });

  return (
    <>
      <PageHeader
        title="Teams"
        description="Procurement, warehouse, production and other teams in each branch. Each member's access comes from their role."
        actions={
          can(user, "teams", "edit") && (
            <>
              <ButtonLink href="/settings/roles" variant="secondary">
                Roles & access
              </ButtonLink>
              <ButtonLink href="/teams/new">New team</ButtonLink>
            </>
          )
        }
      />
      <div className="space-y-6">
        {branches.map((branch) => (
          <Card key={branch.id}>
            <CardHeader title={`${branch.code} · ${branch.name}`} />
            <Table>
              <THead>
                <tr>
                  <TH>Team</TH>
                  <TH>Type</TH>
                  <TH>Lead</TH>
                  <TH>Members</TH>
                </tr>
              </THead>
              <TBody>
                {branch.teams.length === 0 && <EmptyRow colSpan={4}>No teams in this branch.</EmptyRow>}
                {branch.teams.map((t) => (
                  <TR key={t.id}>
                    <TD>
                      <Link href={`/teams/${t.id}`} className="font-medium text-brand-700 hover:underline">
                        {t.name}
                      </Link>
                    </TD>
                    <TD>
                      <Badge>{TEAM_TYPE_LABELS[t.type]}</Badge>
                    </TD>
                    <TD className="text-ink-soft">{t.lead?.name ?? "—"}</TD>
                    <TD className="text-ink-soft">
                      {t.members.map((m) => m.user.name).join(", ") || "—"}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        ))}
      </div>
    </>
  );
}
