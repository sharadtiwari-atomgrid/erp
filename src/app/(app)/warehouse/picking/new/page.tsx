import type { Metadata } from "next";
import { buttonClass } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getBranchScope } from "@/lib/branch";
import { db } from "@/lib/db";
import { num } from "@/lib/format";
import { param } from "@/lib/forms";
import { getWarehouseOptions } from "@/lib/options";
import { createPickingSession } from "../actions";
import { SessionForm } from "./session-form";

// Signed-in, per-user page: render on request instead of an instant static shell.
export const instant = false;

export const metadata: Metadata = { title: "New picking session" };

export default async function NewPickingSessionPage({ searchParams }: PageProps<"/warehouse/picking/new">) {
  const user = await requireUser("outbound", "edit");
  const sp = await searchParams;
  const scope = await getBranchScope();
  const warehouses = await getWarehouseOptions({ branchId: scope.branchId });
  const warehouseId = param(sp, "warehouse") || (warehouses.length === 1 ? warehouses[0].id : "");
  const warehouse = warehouses.find((w) => w.id === warehouseId);

  const [outbounds, users] = warehouse
    ? await Promise.all([
        db.outboundOrder.findMany({
          where: { warehouseId: warehouse.id, status: "PENDING", pickingSessionId: null },
          orderBy: { createdAt: "asc" },
          include: {
            salesOrder: { select: { number: true, customer: { select: { name: true } } } },
            lines: { select: { quantity: true } },
          },
        }),
        db.user.findMany({
          where: { isActive: true, OR: [{ branchId: null }, { branchId: warehouse.branchId }] },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
      ])
    : [[], []];

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="New picking session"
        description="Group pending outbound orders of one warehouse for a picker."
        back={{ href: "/warehouse/picking", label: "Picking sessions" }}
      />
      <Card>
        <CardHeader title="Warehouse" />
        <CardBody>
          <form className="flex flex-wrap items-center gap-2">
            <Select name="warehouse" defaultValue={warehouseId} required className="max-w-sm" aria-label="Warehouse">
              <option value="">Select a warehouse…</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </Select>
            <button type="submit" className={buttonClass("secondary")}>
              Show pending orders
            </button>
          </form>
        </CardBody>
      </Card>
      {warehouse && (
        <SessionForm
          key={warehouse.id}
          action={createPickingSession}
          warehouseId={warehouse.id}
          users={users}
          defaultUserId={users.some((u) => u.id === user.id) ? user.id : ""}
          outbounds={outbounds.map((o) => ({
            id: o.id,
            number: o.number,
            salesOrder: o.salesOrder.number,
            customer: o.salesOrder.customer.name,
            createdAt: o.createdAt.toISOString(),
            lines: o.lines.length,
            units: o.lines.reduce((s, l) => s + num(l.quantity), 0),
          }))}
        />
      )}
    </div>
  );
}
