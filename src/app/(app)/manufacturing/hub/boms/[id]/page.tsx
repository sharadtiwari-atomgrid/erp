import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, DetailList, StatCard } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney, formatNumber, num } from "@/lib/format";
import { can } from "@/lib/permissions";
import { ActivityCard } from "../../../_components/activity-card";
import { MfgStatusBadge, ModeBadge } from "../../../_components/badges";
import { bomCostRollup } from "../../../_lib/bom-math";
import { copyBomToNewVersion, deleteBom, makeBomDefault } from "../actions";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Bill of materials" };

export default async function BomPage({ params }: PageProps<"/manufacturing/hub/boms/[id]">) {
  const user = await requireUser("hubSettings");
  const { id } = await params;
  const bom = await db.bom.findUnique({
    where: { id },
    include: {
      product: { select: { id: true, sku: true, name: true, unit: true, supplyMode: true, itemType: true } },
      lines: { orderBy: { position: "asc" }, include: { component: { select: { id: true, sku: true, name: true, unit: true, purchasePrice: true } } } },
      operations: { orderBy: { sequence: "asc" }, include: { machine: { select: { id: true, code: true, name: true, hourlyCost: true, status: true } } } },
      productionOrders: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, number: true, status: true, quantity: true, dueDate: true } },
    },
  });
  if (!bom) notFound();

  const [siblings, orderCount, lockedCount] = await Promise.all([
    db.bom.findMany({ where: { productId: bom.productId, id: { not: id } }, orderBy: { version: "desc" }, select: { id: true, code: true, version: true, isDefault: true, isActive: true } }),
    db.productionOrder.count({ where: { bomId: id } }),
    db.productionOrder.count({ where: { bomId: id, status: { notIn: ["DRAFT", "CANCELLED"] } } }),
  ]);

  const outputQty = num(bom.outputQty);
  const rollup = bomCostRollup({
    outputQty,
    lines: bom.lines.map((l) => ({ quantity: num(l.quantity), scrapPct: num(l.scrapPct), unitCost: num(l.component.purchasePrice) })),
    operations: bom.operations.map((o) => ({ setupHours: num(o.setupHours), runHoursPerUnit: num(o.runHoursPerUnit), hourlyCost: num(o.machine?.hourlyCost) })),
  });
  const canEdit = can(user, "hubSettings", "edit");

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {bom.code} <span className="text-ink-soft">v{bom.version}</span>
            {bom.isDefault && <Badge tone="blue">Default</Badge>}
            <StatusBadge status={bom.isActive ? "ACTIVE" : "INACTIVE"} />
          </span>
        }
        description={`${bom.product.name} · makes ${formatNumber(outputQty)} ${bom.product.unit} per run`}
        back={{ href: "/manufacturing/hub/boms", label: "Bills of materials" }}
        actions={
          <>
            {can(user, "production", "edit") && bom.isActive && (
              <ButtonLink href={`/manufacturing/orders/new?productId=${bom.product.id}&bomId=${id}`} variant="secondary">
                New production order
              </ButtonLink>
            )}
            {canEdit && orderCount === 0 && (
              <ActionButton action={deleteBom.bind(null, id)} confirmMessage={`Delete ${bom.code}?`} pendingText="Deleting…">
                Delete
              </ActionButton>
            )}
            {canEdit && !bom.isDefault && (
              <ActionButton action={makeBomDefault.bind(null, id)} pendingText="Saving…">
                Make default
              </ActionButton>
            )}
            {canEdit && (
              <ActionButton action={copyBomToNewVersion.bind(null, id)} pendingText="Copying…">
                Copy to new version
              </ActionButton>
            )}
            {canEdit && lockedCount === 0 && <ButtonLink href={`/manufacturing/hub/boms/${id}/edit`}>Edit</ButtonLink>}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Component cost" value={formatMoney(rollup.componentCost)} hint={`per ${formatNumber(outputQty)} ${bom.product.unit}`} />
        <StatCard label="Machine cost" value={formatMoney(rollup.machineCost)} hint={`per ${formatNumber(outputQty)} ${bom.product.unit}`} />
        <StatCard label="Total cost" value={formatMoney(rollup.total)} />
        <StatCard label="Cost per unit" value={formatMoney(rollup.perUnit)} hint="Components at purchase price + machine hours" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DetailList
                items={[
                  { label: "Product", value: `${bom.product.sku} — ${bom.product.name}` },
                  { label: "Supply mode", value: <ModeBadge mode={bom.product.supplyMode} /> },
                  { label: "Output quantity", value: `${formatNumber(outputQty)} ${bom.product.unit}` },
                  { label: "Notes", value: bom.notes },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Other versions" />
            <ul className="divide-y divide-line">
              {siblings.length === 0 && <li className="px-5 py-6 text-center text-sm text-ink-faint">Only version.</li>}
              {siblings.map((s) => (
                <li key={s.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <Link href={`/manufacturing/hub/boms/${s.id}`} className="font-medium text-brand-700 hover:underline">
                    {s.code} v{s.version}
                  </Link>
                  <span className="flex gap-1">
                    {s.isDefault && <Badge tone="blue">Default</Badge>}
                    {!s.isActive && <StatusBadge status="INACTIVE" />}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Components" />
            <Table>
              <THead>
                <tr>
                  <TH>Component</TH>
                  <TH align="right">Qty</TH>
                  <TH align="right">Scrap %</TH>
                  <TH align="right">With scrap</TH>
                  <TH align="right">Unit cost</TH>
                  <TH align="right">Cost</TH>
                </tr>
              </THead>
              <TBody>
                {bom.lines.length === 0 && <EmptyRow colSpan={6}>No components.</EmptyRow>}
                {bom.lines.map((l, i) => (
                  <TR key={l.id}>
                    <TD>
                      <Link href={`/inventory/products/${l.component.id}`} className="font-medium text-brand-700 hover:underline">
                        {l.component.name}
                      </Link>
                      <div className="font-mono text-xs text-ink-faint">{l.component.sku}</div>
                    </TD>
                    <TD align="right">
                      {formatNumber(l.quantity, 4)} <span className="text-xs text-ink-faint">{l.component.unit}</span>
                    </TD>
                    <TD align="right">{formatNumber(l.scrapPct, 2)}</TD>
                    <TD align="right">{formatNumber(rollup.lines[i].qtyWithScrap)}</TD>
                    <TD align="right">{formatMoney(l.component.purchasePrice)}</TD>
                    <TD align="right">{formatMoney(rollup.lines[i].cost)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>

          <Card>
            <CardHeader title="Operations" description={`Hours shown for one run of ${formatNumber(outputQty)} ${bom.product.unit}`} />
            <Table>
              <THead>
                <tr>
                  <TH>Seq</TH>
                  <TH>Operation</TH>
                  <TH>Machine</TH>
                  <TH align="right">Setup h</TH>
                  <TH align="right">Run h / unit</TH>
                  <TH align="right">Hours</TH>
                  <TH align="right">Cost</TH>
                </tr>
              </THead>
              <TBody>
                {bom.operations.length === 0 && <EmptyRow colSpan={7}>No operations; orders for this BOM can&apos;t be auto-scheduled.</EmptyRow>}
                {bom.operations.map((o, i) => (
                  <TR key={o.id}>
                    <TD className="tabular-nums">{o.sequence}</TD>
                    <TD>{o.name}</TD>
                    <TD>
                      {o.machine ? (
                        <span className="flex items-center gap-2">
                          <Link href={`/manufacturing/hub/machines/${o.machine.id}`} className="text-brand-700 hover:underline">
                            {o.machine.code}
                          </Link>
                          {o.machine.status !== "ACTIVE" && <MfgStatusBadge status={o.machine.status} />}
                        </span>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </TD>
                    <TD align="right">{formatNumber(o.setupHours, 2)}</TD>
                    <TD align="right">{formatNumber(o.runHoursPerUnit, 4)}</TD>
                    <TD align="right">{formatNumber(rollup.operations[i].hours, 2)}</TD>
                    <TD align="right">{formatMoney(rollup.operations[i].cost)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>

          {can(user, "production") && (
            <Card>
              <CardHeader title="Production orders using this BOM" />
              <Table>
                <THead>
                  <tr>
                    <TH>Order</TH>
                    <TH align="right">Qty</TH>
                    <TH>Due</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <TBody>
                  {bom.productionOrders.length === 0 && <EmptyRow colSpan={4}>None yet.</EmptyRow>}
                  {bom.productionOrders.map((o) => (
                    <TR key={o.id}>
                      <TD>
                        <Link href={`/manufacturing/orders/${o.id}`} className="font-medium text-brand-700 hover:underline">
                          {o.number}
                        </Link>
                      </TD>
                      <TD align="right">{formatNumber(o.quantity)}</TD>
                      <TD>{formatDate(o.dueDate)}</TD>
                      <TD>
                        <MfgStatusBadge status={o.status} />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          )}
          <ActivityCard entityType="Bom" entityId={id} />
        </div>
      </div>
    </>
  );
}
