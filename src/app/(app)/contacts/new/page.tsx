import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { ContactRole } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth";
import { param } from "@/lib/forms";
import { createContact } from "../actions";
import { ContactForm } from "../contact-form";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "New contact" };

export default async function NewContactPage({ searchParams }: PageProps<"/contacts/new">) {
  await requireUser("contacts", "edit");
  const role = param(await searchParams, "role");
  return (
    <div className="max-w-3xl">
      <PageHeader title="New contact" back={{ href: "/contacts", label: "Contacts" }} />
      <ContactForm
        action={createContact}
        cancelHref="/contacts"
        defaultRoles={role in ContactRole ? [role as ContactRole] : undefined}
      />
    </div>
  );
}
