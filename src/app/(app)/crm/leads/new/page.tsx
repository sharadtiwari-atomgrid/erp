import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { createLead } from "../actions";
import { LeadForm } from "../lead-form";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "New lead" };

export default async function NewLeadPage() {
  const user = await requireUser("leads", "edit");
  const owners = await db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <div className="max-w-3xl">
      <PageHeader title="New lead" back={{ href: "/crm/leads", label: "Leads" }} />
      <LeadForm
        action={createLead}
        owners={owners}
        cancelHref="/crm/leads"
        initial={{ name: "", company: null, email: null, phone: null, source: null, estimatedValue: 0, ownerId: user.id, notes: null }}
      />
    </div>
  );
}
