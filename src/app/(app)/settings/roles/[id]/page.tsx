import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { ActionButton } from "@/components/ui/action-button";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parsePermissions } from "@/lib/permissions";
import { deleteRole, updateRole } from "../actions";
import { RoleForm } from "../role-form";

export const metadata: Metadata = { title: "Edit role" };

export default async function EditRolePage({ params }: PageProps<"/settings/roles/[id]">) {
  await requireUser("settings", "edit");
  const { id } = await params;
  const role = await db.accessRole.findUnique({ where: { id } });
  if (!role) notFound();
  return (
    <div className="max-w-3xl">
      <PageHeader
        title={`Edit ${role.name}`}
        back={{ href: "/settings/roles", label: "Roles & access" }}
        actions={
          !role.isSystem && (
            <ActionButton action={deleteRole.bind(null, id)} variant="danger" confirmMessage={`Delete the ${role.name} role?`}>
              Delete role
            </ActionButton>
          )
        }
      />
      <RoleForm action={updateRole.bind(null, id)} initial={{ ...role, permissions: parsePermissions(role.permissions) }} />
    </div>
  );
}
