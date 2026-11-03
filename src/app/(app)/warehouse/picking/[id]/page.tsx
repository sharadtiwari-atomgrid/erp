import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { Card, CardBody, CardHeader, DetailList } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyRow, Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime, formatNumber, num } from "@/lib/format";
import { can } from "@/lib/permissions";
import { ActivityCard } from "../../../sales/_components/activity-card";
import { PickForm } from "../../_components/pick-form";
import { WarehouseStatusBadge } from "../../_components/status";
import { loadPickSheet } from "../../_lib/pick-sheet";
import { cancelPickingSession, saveSessionPicks } from "../actions";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "Picking session" };

export default async function PickingSessionPage({ params }: PageProps<"/warehouse/picking/[id]">) {
  const user = await requireUser("outbound");
  const { id } = await params;
  const session = await db.pickingSession.findUnique({
    where: { id },
    include: {
      warehouse: { select: { id: true, code: true, name: true } },
      assignedTo: { select: { name: true } },
      outbounds: {
        orderBy: { number: "asc" },
        include: {
          salesOrder: { select: { number: true, customer: { select: { name: true } } } },
          lines: { select: { quantity: true, pickedQty: true } },
        },
      },
    },
  });
  if (!session) notFound();

  const open = session.status === "OPEN";
  const canEdit = can(user, "outbound", "edit");
  const picking = session.outbounds.filter((o) => o.status === "PICKING");
  const sheet = open && canEdit && picking.length > 0 ? await loadPickSheet(picking.map((o) => o.id), session.warehouseId) : null;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {session.number} <WarehouseStatusBadge status={session.status} />
          </span>
        }
        description={`${session.warehouse.code} — ${session.warehouse.name} · ${session.assignedTo?.name ?? "Unassigned"}`}
        back={{ href: "/warehouse/picking", label: "Picking sessions" }}
        actions={
          open &&
          canEdit && (
            <ActionButton
              action={cancelPickingSession.bind(null, id)}
              variant="ghost"
              confirmMessage="Cancel this session? Picks are undone and the orders go back to pending."
              pendingText="Cancelling…"
            >
              Cancel session
            </ActionButton>
          )
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {sheet && (
            <Card>
              <CardHeader
                title="Pick sheet"
                description="Completing the session marks orders with picks as picked; orders with nothing picked go back to pending."
              />
              <PickForm
                action={saveSessionPicks.bind(null, id)}
                groups={sheet.groups}
                bins={sheet.bins}
                binStock={sheet.binStock}
                completeLabel="Complete session"
              />
            </Card>
          )}
          <Card>
            <CardHeader title="Orders" />
            <Table>
              <THead>
                <tr>
                  <TH>Outbound</TH>
                  <TH>Sales order</TH>
                  <TH>Customer</TH>
                  <TH align="right">Qty</TH>
                  <TH align="right">Picked</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {session.outbounds.length === 0 && <EmptyRow colSpan={6}>No orders in this session.</EmptyRow>}
                {session.outbounds.map((o) => (
                  <TR key={o.id}>
                    <TD>
                      <Link href={`/warehouse/outbound/${o.id}`} className="font-medium text-brand-700 hover:underline">
                        {o.number}
                      </Link>
                    </TD>
                    <TD>{o.salesOrder.number}</TD>
                    <TD>{o.salesOrder.customer.name}</TD>
                    <TD align="right">{formatNumber(o.lines.reduce((s, l) => s + num(l.quantity), 0))}</TD>
                    <TD align="right">{formatNumber(o.lines.reduce((s, l) => s + num(l.pickedQty), 0))}</TD>
                    <TD>
                      <WarehouseStatusBadge status={o.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DetailList
                items={[
                  { label: "Warehouse", value: `${session.warehouse.code} — ${session.warehouse.name}` },
                  { label: "Picker", value: session.assignedTo?.name ?? "Unassigned" },
                  { label: "Started", value: formatDateTime(session.startedAt) },
                  { label: "Closed", value: session.completedAt ? formatDateTime(session.completedAt) : null },
                ]}
              />
            </CardBody>
          </Card>
          <ActivityCard entityType="PickingSession" entityId={id} />
        </div>
      </div>
    </>
  );
}
