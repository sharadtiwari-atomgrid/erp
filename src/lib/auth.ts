import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { readSession } from "@/lib/session";
import { can, parsePermissions, type Access, type Module, type Permissions } from "@/lib/permissions";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  roleName: string;
  fullAccess: boolean;
  permissions: Permissions;
  /** Set when the user is restricted to one branch. */
  branchId: string | null;
};

/** Returns the signed-in user with their role's permissions, or null. Deduplicated per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await readSession();
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      branchId: true,
      role: { select: { name: true, fullAccess: true, permissions: true } },
    },
  });
  if (!user || !user.isActive) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roleName: user.role.name,
    fullAccess: user.role.fullAccess,
    permissions: parsePermissions(user.role.permissions),
    branchId: user.branchId,
  };
});

/**
 * Use at the top of every page and server action. Redirects to /login when
 * signed out, and to /forbidden when the user's role lacks access.
 */
export async function requireUser(module?: Module, access: Access = "view"): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (module && !can(user, module, access)) redirect("/forbidden");
  return user;
}
