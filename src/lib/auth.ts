import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { readSession } from "@/lib/session";
import { can, type Access, type Module } from "@/lib/permissions";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: import("@/generated/prisma/enums").Role;
};

/** Returns the signed-in user, or null. Deduplicated per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await readSession();
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
});

/**
 * Use at the top of every page and server action. Redirects to /login when
 * signed out, and to /forbidden when the user's role lacks access.
 */
export async function requireUser(module?: Module, access: Access = "view"): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (module && !can(user.role, module, access)) redirect("/forbidden");
  return user;
}
