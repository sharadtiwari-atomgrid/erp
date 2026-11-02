import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { num } from "@/lib/format";
import { updateLead } from "../../actions";
import { LeadForm } from "../../lead-form";

export const metadata: Metadata = { title: "Edit lead" };

export default async function EditLeadPage({ params }: PageProps<"/crm/leads/[id]/edit">) {
  await requireUser("leads", "edit");
  const { id } = await params;
  const [lead, owners] = await Promise.all([
    db.lead.findUnique({ where: { id } }),
    db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!lead) notFound();

  return (
    <div className="max-w-3xl">
      <PageHeader title={`Edit ${lead.name}`} back={{ href: `/crm/leads/${id}`, label: lead.name }} />
      <LeadForm
        action={updateLead.bind(null, id)}
        owners={owners}
        cancelHref={`/crm/leads/${id}`}
        initial={{ ...lead, estimatedValue: num(lead.estimatedValue) }}
      />
    </div>
  );
}
