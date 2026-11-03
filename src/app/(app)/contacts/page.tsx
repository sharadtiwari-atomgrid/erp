import Link from "next/link";
import type { Metadata } from "next";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListToolbar, Pagination } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { Prisma } from "@/generated/prisma/client";
import { ContactRole } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { pagination, param } from "@/lib/forms";
import { can } from "@/lib/permissions";
import { CONTACT_ROLE_LABELS, CONTACT_ROLE_TONES } from "./roles";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Third-party contacts" };

export default async function ContactsPage({ searchParams }: PageProps<"/contacts">) {
  const user = await requireUser("contacts");
  const sp = await searchParams;
  const q = param(sp, "q");
  const role = param(sp, "role");
  const status = param(sp, "status");
  const { page, take, skip } = pagination(sp);

  const where: Prisma.ContactWhereInput = {
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
        { contactPerson: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        { gstin: { contains: q, mode: "insensitive" } },
      ],
    }),
    ...(role in ContactRole && { roles: { has: role as ContactRole } }),
    ...(status === "ACTIVE" && { isActive: true }),
    ...(status === "INACTIVE" && { isActive: false }),
  };

  const [contacts, total] = await Promise.all([
    db.contact.findMany({ where, orderBy: { name: "asc" }, take, skip }),
    db.contact.count({ where }),
  ]);

  return (
    <>
      <PageHeader
        title="Third-party contacts"
        description="Customers, suppliers, transporters and every other external party in your supply chain."
        actions={
          can(user, "contacts", "edit") && (
            <ButtonLink href={`/contacts/new${role ? `?role=${role}` : ""}`}>New contact</ButtonLink>
          )
        }
      />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {[["", "All"], ...Object.entries(CONTACT_ROLE_LABELS)].map(([value, label]) => (
          <Link
            key={value}
            href={value ? `/contacts?role=${value}` : "/contacts"}
            className={
              role === value
                ? "rounded-full bg-ink px-3 py-1 font-medium text-white"
                : "rounded-full border border-line bg-surface px-3 py-1 text-ink-soft hover:text-ink"
            }
          >
            {label}
          </Link>
        ))}
      </div>
      <Card>
        <ListToolbar
          q={q}
          placeholder="Search name, code, person, email, phone, GSTIN"
          filter={{
            name: "status",
            value: status,
            allLabel: "Active and inactive",
            options: [
              { value: "ACTIVE", label: "Active" },
              { value: "INACTIVE", label: "Inactive" },
            ],
          }}
        >
          {role && <input type="hidden" name="role" value={role} />}
        </ListToolbar>
        <Table>
          <THead>
            <tr>
              <TH>Code</TH>
              <TH>Name</TH>
              <TH>Roles</TH>
              <TH>Contact</TH>
              <TH>City / State</TH>
              <TH>GSTIN</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {contacts.length === 0 && <EmptyRow colSpan={7} />}
            {contacts.map((c) => (
              <TR key={c.id}>
                <TD className="font-mono text-xs text-ink-soft">{c.code}</TD>
                <TD>
                  <Link href={`/contacts/${c.id}`} className="font-medium text-brand-700 hover:underline">
                    {c.name}
                  </Link>
                  {c.contactPerson && <div className="text-xs text-ink-faint">{c.contactPerson}</div>}
                </TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {c.roles.map((r) => (
                      <Badge key={r} tone={CONTACT_ROLE_TONES[r]}>
                        {CONTACT_ROLE_LABELS[r]}
                      </Badge>
                    ))}
                  </div>
                </TD>
                <TD className="text-ink-soft">
                  <div>{c.email ?? "—"}</div>
                  <div className="text-xs">{c.phone}</div>
                </TD>
                <TD className="text-ink-soft">{[c.city, c.state].filter(Boolean).join(", ") || "—"}</TD>
                <TD className="font-mono text-xs">{c.gstin ?? "—"}</TD>
                <TD>
                  <StatusBadge status={c.isActive ? "ACTIVE" : "INACTIVE"} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <Pagination page={page} pageSize={take} total={total} searchParams={sp} />
      </Card>
    </>
  );
}
