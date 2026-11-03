import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBranchOptions } from "@/lib/options";
import { createTeam } from "../actions";
import { TeamForm } from "../team-form";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "New team" };

export default async function NewTeamPage() {
  await requireUser("teams", "edit");
  const [branches, people] = await Promise.all([
    getBranchOptions(),
    db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <div className="max-w-3xl">
      <PageHeader title="New team" back={{ href: "/teams", label: "Teams" }} />
      <TeamForm action={createTeam} branches={branches} people={people} />
    </div>
  );
}
