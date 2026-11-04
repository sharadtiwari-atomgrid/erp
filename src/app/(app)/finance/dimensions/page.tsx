import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureFinanceSetup } from "@/lib/finance/setup";
import { can } from "@/lib/permissions";
import { InlineForm } from "../_gl/inline-form";
import { addValue, createDimension, deleteDimension, deleteValue, syncBranchValues, updateDimension, updateValue } from "./actions";

export const metadata: Metadata = { title: "Dimensions" };

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export default async function FinanceDimensionsPage() {
  const user = await requireUser("finance", "view");
  await ensureFinanceSetup();
  const canEdit = can(user, "finance", "edit");
  const dimensions = await db.dimension.findMany({ orderBy: { code: "asc" }, include: { values: { orderBy: { code: "asc" } } } });

  return (
    <>
      <PageHeader
        title="Dimensions"
        description="Analysis tags (division, department, branch, project…) carried on journal lines and ledger entries, and used to filter reports and budgets."
        actions={canEdit && <InlineForm action={syncBranchValues} submitLabel="Sync branch values" size="md" />}
      />
      <div className="space-y-6">
        {dimensions.map((d) => (
          <Card key={d.id}>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  {d.name} <span className="text-xs font-normal text-ink-soft">{d.code}</span>
                  {!d.isActive && <Badge tone="gray">Inactive</Badge>}
                </span>
              }
              description={`${d.values.filter((v) => v.isActive).length} active values`}
              actions={
                canEdit && (
                  <>
                    <InlineForm action={updateDimension.bind(null, d.id)} submitLabel="Save">
                      <Input name="name" defaultValue={d.name} aria-label="Dimension name" className="h-8 w-40" required />
                      <label className="flex items-center gap-1.5 text-xs text-ink">
                        <input type="checkbox" name="isActive" defaultChecked={d.isActive} className="h-4 w-4 rounded border-line" />
                        Active
                      </label>
                    </InlineForm>
                    <InlineForm
                      action={deleteDimension.bind(null, d.id)}
                      submitLabel="Delete"
                      variant="ghost"
                      confirmMessage={`Delete ${d.name}? If it's in use it will be deactivated instead.`}
                    />
                  </>
                )
              }
            />
            <Table>
              <THead>
                <tr>
                  <TH>Code</TH>
                  <TH>Name</TH>
                  <TH>Status</TH>
                  {canEdit && <TH align="right">Edit</TH>}
                </tr>
              </THead>
              <TBody>
                {d.values.length === 0 && <EmptyRow colSpan={canEdit ? 4 : 3}>No values yet.</EmptyRow>}
                {d.values.map((v) => (
                  <TR key={v.id}>
                    <TD className="font-medium tabular-nums">{v.code}</TD>
                    <TD>{v.name}</TD>
                    <TD>{v.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Inactive</Badge>}</TD>
                    {canEdit && (
                      <TD align="right">
                        <div className="flex justify-end gap-2">
                          <InlineForm action={updateValue.bind(null, v.id)} submitLabel="Save">
                            <Input name="name" defaultValue={v.name} aria-label={`${v.code} name`} className="h-8 w-44" required />
                            <label className="flex items-center gap-1.5 text-xs text-ink">
                              <input type="checkbox" name="isActive" defaultChecked={v.isActive} className="h-4 w-4 rounded border-line" />
                              Active
                            </label>
                          </InlineForm>
                          <InlineForm action={deleteValue.bind(null, v.id)} submitLabel="Delete" variant="ghost" confirmMessage={`Delete ${v.name}? If it's in use it will be deactivated instead.`} />
                        </div>
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </Table>
            {canEdit && (
              <CardBody className="border-t border-line">
                <InlineForm action={addValue.bind(null, d.id)} submitLabel="Add value">
                  <Input name="code" placeholder="Code" aria-label="New value code" className="h-8 w-32" required />
                  <Input name="name" placeholder="Name" aria-label="New value name" className="h-8 w-56" required />
                </InlineForm>
              </CardBody>
            )}
          </Card>
        ))}
        {canEdit && (
          <Card>
            <CardHeader title="New dimension" />
            <CardBody>
              <InlineForm action={createDimension} submitLabel="Add dimension" variant="primary" size="md">
                <Input name="code" placeholder="Code, e.g. PROJECT" aria-label="Dimension code" className="w-48" required />
                <Input name="name" placeholder="Name" aria-label="Dimension name" className="w-56" required />
              </InlineForm>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
