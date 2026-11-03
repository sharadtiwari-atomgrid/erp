import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBranchOptions } from "@/lib/options";
import { createUser } from "../actions";
import { UserForm } from "../user-form";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Add user" };

export default async function NewUserPage() {
  await requireUser("settings", "edit");
  return (
    <div className="max-w-2xl">
      <PageHeader title="Add user" back={{ href: "/settings/users", label: "Users" }} />
      <UserForm
        action={createUser}
        roles={await db.accessRole.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })}
        branches={await getBranchOptions()}
      />
    </div>
  );
}
