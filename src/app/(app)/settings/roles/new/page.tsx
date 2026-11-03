import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { createRole } from "../actions";
import { RoleForm } from "../role-form";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "New role" };

export default async function NewRolePage() {
  await requireUser("settings", "edit");
  return (
    <div className="max-w-3xl">
      <PageHeader title="New role" back={{ href: "/settings/roles", label: "Roles & access" }} />
      <RoleForm action={createRole} />
    </div>
  );
}
