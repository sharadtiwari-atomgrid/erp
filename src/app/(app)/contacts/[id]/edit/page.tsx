import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { num } from "@/lib/format";
import { updateContact } from "../../actions";
import { ContactForm } from "../../contact-form";

export const metadata: Metadata = { title: "Edit contact" };

export default async function EditContactPage({ params }: PageProps<"/contacts/[id]/edit">) {
  await requireUser("contacts", "edit");
  const { id } = await params;
  const contact = await db.contact.findUnique({ where: { id } });
  if (!contact) notFound();

  return (
    <div className="max-w-3xl">
      <PageHeader title={`Edit ${contact.name}`} back={{ href: `/contacts/${id}`, label: contact.name }} />
      <ContactForm
        action={updateContact.bind(null, id)}
        cancelHref={`/contacts/${id}`}
        initial={{ ...contact, creditLimit: num(contact.creditLimit) }}
      />
    </div>
  );
}
