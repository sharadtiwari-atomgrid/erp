import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { formatMoney, num } from "@/lib/format";
import { param } from "@/lib/forms";
import { can } from "@/lib/permissions";
import { deleteTdsSection, saveTdsSection } from "../actions";
import { TaxNav } from "../_lib/nav";
import { kindOf } from "../_lib/tds";
import { SectionForm } from "./section-form";

export const metadata: Metadata = { title: "TDS & TCS Sections" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function TdsSectionsPage({ searchParams }: PageProps<"/finance/tds/sections">) {
  const user = await requireUser("finance");
  await ensureFinanceSetup();
  const sp = await searchParams;
  const kind = kindOf(param(sp, "kind"));
  const editId = param(sp, "edit");
  const canEdit = can(user, "finance", "edit");
  const sections = await db.tdsSection.findMany({
    where: { kind },
    orderBy: { code: "asc" },
    include: { _count: { select: { entries: true } } },
  });
  const editing = editId ? sections.find((s) => s.id === editId) : undefined;

  return (
    <>
      <PageHeader title="TDS & TCS Sections" description="Sections, rates and thresholds used on payments and the quarterly returns." back={{ href: "/finance", label: "Finance" }} />
      <TaxNav kind={kind} current="sections" />
      <Card>
        <Table>
          <THead>
            <tr>
              <TH>Section</TH>
              <TH>Description</TH>
              <TH align="right">Rate – individual</TH>
              <TH align="right">Rate – company</TH>
              <TH align="right">Single threshold</TH>
              <TH align="right">Annual threshold</TH>
              <TH>Status</TH>
              <TH align="right">Entries</TH>
              {canEdit && <TH />}
            </tr>
          </THead>
          <TBody>
            {sections.length === 0 && <EmptyRow colSpan={canEdit ? 9 : 8}>No {kind} sections yet.</EmptyRow>}
            {sections.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">{s.code}</TD>
                <TD>{s.description}</TD>
                <TD align="right">{num(s.rateIndividual)}%</TD>
                <TD align="right">{num(s.rateCompany)}%</TD>
                <TD align="right">{s.thresholdSingle ? formatMoney(s.thresholdSingle) : "—"}</TD>
                <TD align="right">{s.thresholdAnnual ? formatMoney(s.thresholdAnnual) : "—"}</TD>
                <TD>{s.isActive ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</TD>
                <TD align="right">{s._count.entries}</TD>
                {canEdit && (
                  <TD align="right">
                    <span className="inline-flex items-center gap-2">
                      <Link href={`/finance/tds/sections?kind=${kind}&edit=${s.id}`} className="text-sm font-medium text-brand-700 hover:underline">
                        Edit
                      </Link>
                      {s._count.entries === 0 && (
                        <ActionButton action={deleteTdsSection.bind(null, s.id)} variant="ghost" size="sm" confirmMessage={`Delete section ${s.code}?`}>
                          Delete
                        </ActionButton>
                      )}
                    </span>
                  </TD>
                )}
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      {canEdit && (
        <Card className="mt-6">
          <CardHeader title={editing ? `Edit section ${editing.code}` : `New ${kind} section`} />
          <CardBody>
            <SectionForm
              key={editing?.id ?? "new"}
              action={saveTdsSection.bind(null, editing?.id ?? null)}
              cancelHref={editing ? `/finance/tds/sections?kind=${kind}` : undefined}
              initial={
                editing
                  ? {
                      code: editing.code,
                      description: editing.description,
                      kind: editing.kind,
                      rateIndividual: num(editing.rateIndividual),
                      rateCompany: num(editing.rateCompany),
                      thresholdSingle: editing.thresholdSingle === null ? null : num(editing.thresholdSingle),
                      thresholdAnnual: editing.thresholdAnnual === null ? null : num(editing.thresholdAnnual),
                      isActive: editing.isActive,
                    }
                  : { code: "", description: "", kind, rateIndividual: 0, rateCompany: 0, thresholdSingle: null, thresholdAnnual: null, isActive: true }
              }
            />
          </CardBody>
        </Card>
      )}
    </>
  );
}
