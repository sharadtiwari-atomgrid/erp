import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList, StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { LeadStatus } from "@/generated/prisma/enums";
import { ActionButton } from "@/components/ui/action-button";
import { ActivityCard } from "@/app/(app)/sales/_components/activity-card";
import { convertLead, setLeadStatus } from "../actions";

export const metadata: Metadata = { title: "Lead" };

/** The next pipeline steps offered for each open status. */
const NEXT_STEPS: Partial<Record<LeadStatus, Array<{ status: LeadStatus; label: string }>>> = {
  NEW: [{ status: "CONTACTED", label: "Mark contacted" }],
  CONTACTED: [{ status: "QUALIFIED", label: "Mark qualified" }],
  LOST: [{ status: "NEW", label: "Reopen" }],
};

export default async function LeadPage({ params }: PageProps<"/crm/leads/[id]">) {
  const user = await requireUser("leads");
  const { id } = await params;
  const lead = await db.lead.findUnique({
    where: { id },
    include: { owner: { select: { name: true } }, customer: { select: { id: true, code: true, name: true } } },
  });
  if (!lead) notFound();

  const canEdit = can(user, "leads", "edit");
  const isOpen = lead.status !== "CONVERTED" && lead.status !== "LOST";

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {lead.name} <StatusBadge status={lead.status} />
          </span>
        }
        description={lead.company ?? undefined}
        back={{ href: "/crm/leads", label: "Leads" }}
        actions={
          canEdit &&
          lead.status !== "CONVERTED" && (
            <>
              {NEXT_STEPS[lead.status]?.map((step) => (
                <ActionButton key={step.status} action={setLeadStatus.bind(null, id, step.status)}>
                  {step.label}
                </ActionButton>
              ))}
              {isOpen && (
                <ActionButton action={setLeadStatus.bind(null, id, "LOST")} confirmMessage="Mark this lead as lost?">
                  Mark lost
                </ActionButton>
              )}
              <ButtonLink href={`/crm/leads/${id}/edit`} variant="secondary">
                Edit
              </ButtonLink>
              {isOpen && can(user, "contacts", "edit") && (
                <ActionButton
                  action={convertLead.bind(null, id)}
                  variant="primary"
                  pendingText="Converting…"
                  confirmMessage="Create a customer from this lead?"
                >
                  Convert to customer
                </ActionButton>
              )}
            </>
          )
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Estimated value" value={formatMoney(lead.estimatedValue)} />
        <StatCard label="Owner" value={lead.owner?.name ?? "Unassigned"} />
        <StatCard label="Created" value={formatDate(lead.createdAt)} hint={`Updated ${formatDate(lead.updatedAt)}`} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {lead.customer && (
            <Card>
              <CardBody className="text-sm">
                Converted to customer{" "}
                <Link href={`/contacts/${lead.customer.id}`} className="font-medium text-brand-700 hover:underline">
                  {lead.customer.name} ({lead.customer.code})
                </Link>
                .
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DetailList
                items={[
                  { label: "Contact name", value: lead.name },
                  { label: "Company", value: lead.company },
                  { label: "Email", value: lead.email },
                  { label: "Phone", value: lead.phone },
                  { label: "Source", value: lead.source },
                  { label: "Notes", value: lead.notes },
                ]}
              />
            </CardBody>
          </Card>
        </div>
        <div className="lg:col-span-1">
          <ActivityCard entityType="Lead" entityId={id} />
        </div>
      </div>
    </>
  );
}
