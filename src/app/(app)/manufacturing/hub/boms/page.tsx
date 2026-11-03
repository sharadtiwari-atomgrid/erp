import Link from "next/link";
import type { Metadata } from "next";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney, formatNumber, num } from "@/lib/format";
import { param } from "@/lib/forms";
import { can } from "@/lib/permissions";
import { HubTabs } from "../../_components/hub-tabs";
import { ModeBadge } from "../../_components/badges";
import { bomCostRollup } from "../../_lib/bom-math";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Bills of materials" };

export default async function BomsPage({ searchParams }: PageProps<"/manufacturing/hub/boms">) {
  const user = await requireUser("hubSettings");
  const sp = await searchParams;
  const q = param(sp, "q");
  const status = param(sp, "status");

  const where: Prisma.BomWhereInput = {
    ...(q && {
      OR: [
        { code: { contains: q, mode: "insensitive" } },
        { product: { name: { contains: q, mode: "insensitive" } } },
        { product: { sku: { contains: q, mode: "insensitive" } } },
      ],
    }),
    ...(status === "ACTIVE" && { isActive: true }),
    ...(status === "INACTIVE" && { isActive: false }),
    ...(status === "DEFAULT" && { isDefault: true }),
  };
  const boms = await db.bom.findMany({
    where,
    orderBy: [{ product: { name: "asc" } }, { version: "desc" }],
    include: {
      product: { select: { id: true, sku: true, name: true, unit: true, supplyMode: true } },
      lines: { include: { component: { select: { purchasePrice: true } } } },
      operations: { include: { machine: { select: { hourlyCost: true } } } },
    },
  });

  return (
    <>
      <PageHeader
        title="Hub settings"
        description="Bills of materials: the components and routing needed to make each manufactured item."
        actions={can(user, "hubSettings", "edit") && <ButtonLink href="/manufacturing/hub/boms/new">New BOM</ButtonLink>}
      />
      <HubTabs active="boms" />
      <Card>
        <ListToolbar
          q={q}
          placeholder="Search BOM code or product"
          filter={{
            name: "status",
            value: status,
            allLabel: "All BOMs",
            options: [
              { value: "DEFAULT", label: "Default only" },
              { value: "ACTIVE", label: "Active" },
              { value: "INACTIVE", label: "Inactive" },
            ],
          }}
        />
        <Table>
          <THead>
            <tr>
              <TH>Code</TH>
              <TH>Product</TH>
              <TH>Mode</TH>
              <TH align="right">Version</TH>
              <TH align="right">Output</TH>
              <TH align="right">Components</TH>
              <TH align="right">Operations</TH>
              <TH align="right">Cost / unit</TH>
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {boms.length === 0 && <EmptyRow colSpan={9}>No BOMs found.</EmptyRow>}
            {boms.map((b) => {
              const rollup = bomCostRollup({
                outputQty: num(b.outputQty),
                lines: b.lines.map((l) => ({ quantity: num(l.quantity), scrapPct: num(l.scrapPct), unitCost: num(l.component.purchasePrice) })),
                operations: b.operations.map((o) => ({
                  setupHours: num(o.setupHours),
                  runHoursPerUnit: num(o.runHoursPerUnit),
                  hourlyCost: num(o.machine?.hourlyCost),
                })),
              });
              return (
                <TR key={b.id}>
                  <TD>
                    <Link href={`/manufacturing/hub/boms/${b.id}`} className="font-medium text-brand-700 hover:underline">
                      {b.code}
                    </Link>
                  </TD>
                  <TD>
                    {b.product.name}
                    <div className="font-mono text-xs text-ink-faint">{b.product.sku}</div>
                  </TD>
                  <TD>
                    <ModeBadge mode={b.product.supplyMode} />
                  </TD>
                  <TD align="right">v{b.version}</TD>
                  <TD align="right">
                    {formatNumber(b.outputQty)} <span className="text-xs text-ink-faint">{b.product.unit}</span>
                  </TD>
                  <TD align="right">{b.lines.length}</TD>
                  <TD align="right">{b.operations.length}</TD>
                  <TD align="right">{formatMoney(rollup.perUnit)}</TD>
                  <TD>
                    <span className="flex gap-1">
                      {b.isDefault && <Badge tone="blue">Default</Badge>}
                      <StatusBadge status={b.isActive ? "ACTIVE" : "INACTIVE"} />
                    </span>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
