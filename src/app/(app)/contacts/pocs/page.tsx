import type { Metadata } from "next";
import { ActionButton } from "@/components/ui/action-button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { param } from "@/lib/forms";
import { can } from "@/lib/permissions";
import { addPoc, deletePoc, renamePoc } from "./actions";
import { AddPocForm, RenamePocForm } from "./poc-forms";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "POCs" };

export default async function PocsPage({ searchParams }: PageProps<"/contacts/pocs">) {
  const user = await requireUser("contacts");
  const q = param(await searchParams, "q");
  const canEdit = can(user, "contacts", "edit");
  const pocs = await db.opsPoc.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : undefined,
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHeader
        title="POCs"
        description="Internal points of contact used across Domestic B2B: Demand POCs, verifiers, logistics and supply POCs. Names are unique (ignoring case)."
      />
      {canEdit && (
        <Card className="mb-6">
          <CardHeader title="Add a POC" />
          <CardBody>
            <AddPocForm action={addPoc} />
          </CardBody>
        </Card>
      )}
      <Card>
        <ListToolbar q={q} placeholder="Search names" />
        <Table>
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Added</TH>
              {canEdit && <TH align="right">Actions</TH>}
            </tr>
          </THead>
          <TBody>
            {pocs.length === 0 && <EmptyRow colSpan={canEdit ? 3 : 2}>{q ? "No POC matches." : "No POCs yet."}</EmptyRow>}
            {pocs.map((p) => (
              <TR key={p.id}>
                <TD className="font-medium">{canEdit ? <RenamePocForm name={p.name} action={renamePoc.bind(null, p.id)} /> : p.name}</TD>
                <TD className="text-ink-soft">{formatDate(p.createdAt)}</TD>
                {canEdit && (
                  <TD align="right">
                    <ActionButton action={deletePoc.bind(null, p.id)} variant="ghost" size="sm" confirmMessage={`Delete ${p.name}?`} pendingText="Deleting…">
                      Delete
                    </ActionButton>
                  </TD>
                )}
              </TR>
            ))}
          </TBody>
        </Table>
        <p className="border-t border-line px-4 py-2.5 text-xs text-ink-faint">
          {pocs.length} POC{pocs.length === 1 ? "" : "s"}
          {q ? " match" : ""}. Renaming or deleting a POC doesn&apos;t change names already written on Fresh POs or MIS jobs.
        </p>
      </Card>
    </>
  );
}
