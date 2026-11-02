import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { createUser } from "../actions";
import { UserForm } from "../user-form";

export const metadata: Metadata = { title: "Add user" };

export default async function NewUserPage() {
  await requireUser("settings", "edit");
  return (
    <div className="max-w-2xl">
      <PageHeader title="Add user" back={{ href: "/settings/users", label: "Users" }} />
      <UserForm action={createUser} />
    </div>
  );
}
