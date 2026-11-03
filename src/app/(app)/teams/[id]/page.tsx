import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { Card, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBranchOptions } from "@/lib/options";
import { can } from "@/lib/permissions";
import { addMember, removeMember, updateTeam } from "../actions";
import { TeamForm } from "../team-form";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage({ params }: PageProps<"/teams/[id]">) {
  const user = await requireUser("teams");
  const { id } = await params;
  const team = await db.team.findUnique({
    where: { id },
    include: {
      branch: { select: { code: true, name: true } },
      members: {
        orderBy: { addedAt: "asc" },
        include: { user: { select: { id: true, name: true, email: true, isActive: true, role: { select: { name: true } } } } },
      },
    },
  });
  if (!team) notFound();

  const editable = can(user, "teams", "edit");
  const [branches, people] = await Promise.all([
    getBranchOptions(team.branchId),
    db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const memberIds = new Set(team.members.map((m) => m.userId));

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title={team.name} description={`${team.branch.code} · ${team.branch.name}`} back={{ href: "/teams", label: "Teams" }} />

      <Card>
        <CardHeader
          title="Members"
          description="What each member can do is set by their role (Settings → Roles & access)."
          actions={
            editable && (
              <ActionButton
                action={addMember.bind(null, id)}
                size="sm"
                fields={
                  <Select name="userId" className="h-8 w-48 text-xs" aria-label="Person to add" defaultValue="">
                    <option value="">Add a person…</option>
                    {people
                      .filter((p) => !memberIds.has(p.id))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </Select>
                }
              >
                Add
              </ActionButton>
            )
          }
        />
        <Table>
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Email</TH>
              <TH>Role</TH>
              <TH />
            </tr>
          </THead>
          <TBody>
            {team.members.length === 0 && <EmptyRow colSpan={4}>No members yet.</EmptyRow>}
            {team.members.map((m) => (
              <TR key={m.userId}>
                <TD className="font-medium">
                  {m.user.name}
                  {team.leadId === m.userId && <span className="ml-2 text-xs text-brand-700">Lead</span>}
                </TD>
                <TD className="text-ink-soft">{m.user.email}</TD>
                <TD className="text-ink-soft">{m.user.role.name}</TD>
                <TD align="right">
                  {editable && (
                    <ActionButton action={removeMember.bind(null, id, m.userId)} variant="ghost" size="sm" confirmMessage={`Remove ${m.user.name} from ${team.name}?`}>
                      Remove
                    </ActionButton>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      {editable && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-ink">Team settings</h2>
          <TeamForm action={updateTeam.bind(null, id)} initial={team} branches={branches} people={people} />
        </div>
      )}
    </div>
  );
}
