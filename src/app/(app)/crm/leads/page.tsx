import Link from "next/link";
import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListToolbar, Pagination } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney, humanize } from "@/lib/format";
import { pagination, param } from "@/lib/forms";
import { can } from "@/lib/permissions";
import type { Prisma } from "@/generated/prisma/client";
import { LeadStatus } from "@/generated/prisma/enums";
import { enumParam } from "@/app/(app)/sales/_lib/documents";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Leads" };

export default async function LeadsPage({ searchParams }: PageProps<"/crm/leads">) {
  const user = await requireUser("leads");
  const sp = await searchParams;
  const q = param(sp, "q");
  const status = param(sp, "status");
  const statusFilter = enumParam(LeadStatus, status);
  const { page, take, skip } = pagination(sp);

  const where: Prisma.LeadWhereInput = {
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { company: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { source: { contains: q, mode: "insensitive" } },
      ],
    }),
    ...(statusFilter && { status: statusFilter }),
  };

  const [leads, total] = await Promise.all([
    db.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: { owner: { select: { name: true } } },
    }),
    db.lead.count({ where }),
  ]);

  return (
    <>
      <PageHeader
        title="Leads"
        description="Prospects in your sales pipeline."
        actions={can(user, "leads", "edit") && <ButtonLink href="/crm/leads/new">New lead</ButtonLink>}
      />
      <Card>
        <ListToolbar
          q={q}
          placeholder="Search name, company, email, phone, source"
          filter={{
            name: "status",
            value: status,
            allLabel: "All statuses",
            options: Object.values(LeadStatus).map((s) => ({ value: s, label: humanize(s) })),
          }}
        />
        <Table>
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Contact</TH>
              <TH>Source</TH>
              <TH>Owner</TH>
              <TH>Created</TH>
              <TH>Status</TH>
              <TH align="right">Est. value</TH>
            </tr>
          </THead>
          <TBody>
            {leads.length === 0 && <EmptyRow colSpan={7} />}
            {leads.map((l) => (
              <TR key={l.id}>
                <TD>
                  <Link href={`/crm/leads/${l.id}`} className="font-medium text-brand-700 hover:underline">
                    {l.name}
                  </Link>
                  {l.company && <div className="text-xs text-ink-soft">{l.company}</div>}
                </TD>
                <TD className="text-ink-soft">
                  <div>{l.email ?? "—"}</div>
                  <div className="text-xs">{l.phone}</div>
                </TD>
                <TD className="text-ink-soft">{l.source ?? "—"}</TD>
                <TD className="text-ink-soft">{l.owner?.name ?? "—"}</TD>
                <TD className="text-ink-soft">{formatDate(l.createdAt)}</TD>
                <TD>
                  <StatusBadge status={l.status} />
                </TD>
                <TD align="right">{formatMoney(l.estimatedValue)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <Pagination page={page} pageSize={take} total={total} searchParams={sp} />
      </Card>
    </>
  );
}
