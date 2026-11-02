"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { TeamType } from "@/generated/prisma/enums";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { f, parseForm, type ActionState } from "@/lib/forms";

const teamSchema = z.object({
  name: f.text("Name"),
  type: z.enum(TeamType),
  branchId: f.id("Branch"),
  leadId: f.optionalText(),
});

export async function createTeam(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("teams", "edit");
  const parsed = parseForm(teamSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { name, branchId } = parsed.data;
  if (await db.team.findUnique({ where: { branchId_name: { branchId, name } } })) {
    return { fieldErrors: { name: ["This branch already has a team with this name"] } };
  }
  const team = await db.team.create({
    data: { ...parsed.data, ...(parsed.data.leadId && { members: { create: { userId: parsed.data.leadId } } }) },
  });
  await logActivity({ userId: user.id, entityType: "Team", entityId: team.id, action: "created", message: `Team ${team.name} created` });
  revalidatePath("/teams");
  redirect(`/teams/${team.id}`);
}

export async function updateTeam(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("teams", "edit");
  const parsed = parseForm(teamSchema, formData);
  if (!parsed.ok) return parsed.state;
  const clash = await db.team.findFirst({ where: { branchId: parsed.data.branchId, name: parsed.data.name, NOT: { id } } });
  if (clash) return { fieldErrors: { name: ["This branch already has a team with this name"] } };

  const team = await db.team.update({ where: { id }, data: parsed.data });
  if (team.leadId) {
    await db.teamMember.upsert({ where: { teamId_userId: { teamId: id, userId: team.leadId } }, create: { teamId: id, userId: team.leadId }, update: {} });
  }
  await logActivity({ userId: user.id, entityType: "Team", entityId: id, action: "updated", message: `Team ${team.name} updated` });
  revalidatePath("/teams");
  revalidatePath(`/teams/${id}`);
  return { success: "Team saved." };
}

export async function addMember(teamId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("teams", "edit");
  const userId = String(formData.get("userId") ?? "");
  if (!userId) return { error: "Choose a person to add." };
  await db.teamMember.upsert({ where: { teamId_userId: { teamId, userId } }, create: { teamId, userId }, update: {} });
  await logActivity({ userId: user.id, entityType: "Team", entityId: teamId, action: "member-added", message: "Team member added" });
  revalidatePath(`/teams/${teamId}`);
  return undefined;
}

export async function removeMember(teamId: string, userId: string): Promise<ActionState> {
  const user = await requireUser("teams", "edit");
  const team = await db.team.findUnique({ where: { id: teamId }, select: { leadId: true } });
  if (team?.leadId === userId) return { error: "Choose a different team lead before removing this person." };
  await db.teamMember.deleteMany({ where: { teamId, userId } });
  await logActivity({ userId: user.id, entityType: "Team", entityId: teamId, action: "member-removed", message: "Team member removed" });
  revalidatePath(`/teams/${teamId}`);
  return undefined;
}
