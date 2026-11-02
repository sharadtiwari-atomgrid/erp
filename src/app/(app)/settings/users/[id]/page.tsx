import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBranchOptions } from "@/lib/options";
import { updateUser } from "../actions";
import { UserForm } from "../user-form";

export const metadata: Metadata = { title: "Edit user" };

export default async function EditUserPage({ params }: PageProps<"/settings/users/[id]">) {
  await requireUser("settings", "edit");
  const { id } = await params;
  const user = await db.user.findUnique({ where: { id }, select: { name: true, email: true, roleId: true, branchId: true, isActive: true } });
  if (!user) notFound();
  return (
    <div className="max-w-2xl">
      <PageHeader title={`Edit ${user.name}`} back={{ href: "/settings/users", label: "Users" }} />
      <UserForm
        action={updateUser.bind(null, id)}
        initial={user}
        roles={await db.accessRole.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })}
        branches={await getBranchOptions(user.branchId)}
      />
    </div>
  );
}
